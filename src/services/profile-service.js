const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * ProfileService - Manages user profiles for PDF form filling
 * Stores profiles securely in user's home directory with encryption for sensitive fields
 */
class ProfileService {
    constructor() {
        this.profilesDir = path.join(os.homedir(), '.pdf-filler', 'profiles');
        this.backupsDir = path.join(os.homedir(), '.pdf-filler', 'backups');
        this.templatesDir = path.join(os.homedir(), '.pdf-filler', 'templates');
        this.encryptionKey = this._getOrCreateEncryptionKey();
        
        // Fields that should be encrypted
        this.sensitiveFields = [
            'ssn', 'social_security_number', 'tax_id', 'ein',
            'password', 'pin', 'account_number', 'routing_number',
            'credit_card', 'debit_card', 'bank_account',
            'driver_license', 'passport', 'license_number'
        ];
        
        // Initialize directories
        this._initializeDirectories();
    }

    /**
     * Create a new profile
     * @param {string} name - Unique profile name
     * @param {Object} data - Profile data object
     * @param {Object} options - Additional options (description, tags, isDefault, template)
     * @returns {Promise<Object>} Created profile object
     * @throws {Error} If profile already exists or validation fails
     */
    async createProfile(name, data, options = {}) {
        try {
            // Validate profile name
            this._validateProfileName(name);
            
            // Check if profile already exists
            if (await this._profileExists(name)) {
                throw new Error(`Profile '${name}' already exists`);
            }

            // Create profile object
            const profile = {
                name: name.trim(),
                description: options.description || '',
                data: this._encryptSensitiveFields(data),
                tags: Array.isArray(options.tags) ? options.tags : [],
                isDefault: Boolean(options.isDefault),
                isTemplate: Boolean(options.isTemplate),
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                    fieldCount: Object.keys(data).length,
                    hasEncryptedFields: this._hasSensitiveFields(data)
                }
            };

            // If this is marked as default, unset other defaults
            if (profile.isDefault) {
                await this._unsetAllDefaults();
            }

            // Save profile
            await this._saveProfile(profile);
            
            // Create backup
            await this._createBackup(profile);

            // Save as template if requested
            if (profile.isTemplate) {
                await this._saveTemplate(profile);
            }

            console.log(`Profile '${name}' created successfully`);
            return profile;

        } catch (error) {
            throw new Error(`Failed to create profile: ${error.message}`);
        }
    }

    /**
     * Retrieve a profile by name
     * @param {string} name - Profile name
     * @returns {Promise<Object|null>} Profile object with decrypted data, or null if not found
     */
    async getProfile(name) {
        try {
            this._validateProfileName(name);
            
            const profilePath = path.join(this.profilesDir, `${name}.json`);
            
            try {
                await fs.access(profilePath);
            } catch {
                return null; // Profile doesn't exist
            }

            const profileData = await fs.readFile(profilePath, 'utf8');
            const profile = JSON.parse(profileData);
            
            // Decrypt sensitive fields
            profile.data = this._decryptSensitiveFields(profile.data);
            
            return profile;

        } catch (error) {
            throw new Error(`Failed to retrieve profile '${name}': ${error.message}`);
        }
    }

    /**
     * Update an existing profile
     * @param {string} name - Profile name
     * @param {Object} data - Updated profile data
     * @param {Object} options - Additional options to update
     * @returns {Promise<Object>} Updated profile object
     * @throws {Error} If profile doesn't exist or validation fails
     */
    async updateProfile(name, data, options = {}) {
        try {
            this._validateProfileName(name);
            
            // Check if profile exists
            const existingProfile = await this.getProfile(name);
            if (!existingProfile) {
                throw new Error(`Profile '${name}' does not exist`);
            }

            // Create backup of current version
            await this._createBackup(existingProfile);

            // Update profile
            const updatedProfile = {
                ...existingProfile,
                data: this._encryptSensitiveFields(data),
                description: options.description !== undefined ? options.description : existingProfile.description,
                tags: options.tags !== undefined ? options.tags : existingProfile.tags,
                isDefault: options.isDefault !== undefined ? options.isDefault : existingProfile.isDefault,
                version: existingProfile.version + 1,
                updatedAt: new Date().toISOString(),
                metadata: {
                    fieldCount: Object.keys(data).length,
                    hasEncryptedFields: this._hasSensitiveFields(data)
                }
            };

            // If this is marked as default, unset other defaults
            if (updatedProfile.isDefault && !existingProfile.isDefault) {
                await this._unsetAllDefaults();
            }

            // Save updated profile
            await this._saveProfile(updatedProfile);

            console.log(`Profile '${name}' updated successfully (version ${updatedProfile.version})`);
            
            // Return with decrypted data
            updatedProfile.data = this._decryptSensitiveFields(updatedProfile.data);
            return updatedProfile;

        } catch (error) {
            throw new Error(`Failed to update profile '${name}': ${error.message}`);
        }
    }

    /**
     * Delete a profile
     * @param {string} name - Profile name
     * @returns {Promise<boolean>} True if profile was deleted, false if it didn't exist
     * @throws {Error} If deletion fails
     */
    async deleteProfile(name) {
        try {
            this._validateProfileName(name);
            
            const profilePath = path.join(this.profilesDir, `${name}.json`);
            
            try {
                await fs.access(profilePath);
            } catch {
                return false; // Profile doesn't exist
            }

            // Create final backup before deletion
            const profile = await this.getProfile(name);
            if (profile) {
                await this._createBackup(profile, `deleted_${Date.now()}`);
            }

            // Delete profile file
            await fs.unlink(profilePath);
            
            console.log(`Profile '${name}' deleted successfully`);
            return true;

        } catch (error) {
            throw new Error(`Failed to delete profile '${name}': ${error.message}`);
        }
    }

    /**
     * List all available profiles
     * @param {Object} filters - Filter options (tags, isDefault, isTemplate)
     * @returns {Promise<Array>} Array of profile summaries (without data)
     */
    async listProfiles(filters = {}) {
        try {
            await this._ensureDirectoryExists(this.profilesDir);
            
            const files = await fs.readdir(this.profilesDir);
            const profileFiles = files.filter(file => file.endsWith('.json'));
            
            const profiles = [];
            
            for (const file of profileFiles) {
                try {
                    const profilePath = path.join(this.profilesDir, file);
                    const profileData = await fs.readFile(profilePath, 'utf8');
                    const profile = JSON.parse(profileData);
                    
                    // Apply filters
                    if (filters.tags && filters.tags.length > 0) {
                        const hasMatchingTag = filters.tags.some(tag => 
                            profile.tags.includes(tag)
                        );
                        if (!hasMatchingTag) continue;
                    }
                    
                    if (filters.isDefault !== undefined && profile.isDefault !== filters.isDefault) {
                        continue;
                    }
                    
                    if (filters.isTemplate !== undefined && profile.isTemplate !== filters.isTemplate) {
                        continue;
                    }
                    
                    // Return summary without sensitive data
                    profiles.push({
                        name: profile.name,
                        description: profile.description,
                        tags: profile.tags,
                        isDefault: profile.isDefault,
                        isTemplate: profile.isTemplate,
                        version: profile.version,
                        createdAt: profile.createdAt,
                        updatedAt: profile.updatedAt,
                        metadata: profile.metadata
                    });
                    
                } catch (parseError) {
                    console.warn(`Skipping corrupted profile file: ${file}`, parseError.message);
                }
            }
            
            // Sort by updatedAt (most recent first)
            profiles.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            return profiles;

        } catch (error) {
            throw new Error(`Failed to list profiles: ${error.message}`);
        }
    }

    /**
     * Export a profile to a file
     * @param {string} name - Profile name
     * @param {string} outputPath - Path where to save the exported profile
     * @param {boolean} includeMetadata - Whether to include metadata (default: true)
     * @returns {Promise<string>} Path to the exported file
     * @throws {Error} If profile doesn't exist or export fails
     */
    async exportProfile(name, outputPath, includeMetadata = true) {
        try {
            const profile = await this.getProfile(name);
            if (!profile) {
                throw new Error(`Profile '${name}' does not exist`);
            }

            // Prepare export data (with decrypted sensitive fields)
            const exportData = {
                name: profile.name,
                description: profile.description,
                data: profile.data, // Already decrypted by getProfile
                tags: profile.tags,
                isTemplate: profile.isTemplate,
                exportedAt: new Date().toISOString(),
                exportedFrom: 'PDF Filler Profile Service'
            };

            if (includeMetadata) {
                exportData.metadata = profile.metadata;
                exportData.version = profile.version;
                exportData.createdAt = profile.createdAt;
                exportData.updatedAt = profile.updatedAt;
            }

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.mkdir(outputDir, { recursive: true });

            // Write export file
            await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf8');
            
            console.log(`Profile '${name}' exported to: ${outputPath}`);
            return outputPath;

        } catch (error) {
            throw new Error(`Failed to export profile '${name}': ${error.message}`);
        }
    }

    /**
     * Import a profile from a file
     * @param {string} filePath - Path to the profile file to import
     * @param {Object} options - Import options (overwrite, rename)
     * @returns {Promise<Object>} Imported profile object
     * @throws {Error} If file doesn't exist, is invalid, or import fails
     */
    async importProfile(filePath, options = {}) {
        try {
            // Check if file exists
            await fs.access(filePath);
            
            // Read and parse file
            const fileData = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(fileData);
            
            // Validate import data
            this._validateImportData(importData);
            
            let profileName = importData.name;
            
            // Handle name conflicts
            if (await this._profileExists(profileName)) {
                if (options.overwrite) {
                    console.log(`Overwriting existing profile '${profileName}'`);
                } else if (options.rename) {
                    profileName = await this._generateUniqueProfileName(profileName);
                    console.log(`Renamed imported profile to '${profileName}'`);
                } else {
                    throw new Error(`Profile '${profileName}' already exists. Use overwrite or rename option.`);
                }
            }
            
            // Create profile from import data
            const profile = await this.createProfile(profileName, importData.data, {
                description: importData.description || 'Imported profile',
                tags: importData.tags || [],
                isDefault: false, // Never import as default
                isTemplate: importData.isTemplate || false
            });
            
            console.log(`Profile imported successfully as '${profileName}'`);
            return profile;

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Import file not found: ${filePath}`);
            }
            throw new Error(`Failed to import profile: ${error.message}`);
        }
    }

    /**
     * Merge two profiles into a new profile
     * @param {string} profile1Name - First profile name
     * @param {string} profile2Name - Second profile name
     * @param {string} newProfileName - Name for the merged profile
     * @param {Object} mergeOptions - Merge strategy options
     * @returns {Promise<Object>} Merged profile object
     * @throws {Error} If profiles don't exist or merge fails
     */
    async mergeProfiles(profile1Name, profile2Name, newProfileName, mergeOptions = {}) {
        try {
            // Get both profiles
            const profile1 = await this.getProfile(profile1Name);
            const profile2 = await this.getProfile(profile2Name);
            
            if (!profile1) {
                throw new Error(`Profile '${profile1Name}' does not exist`);
            }
            if (!profile2) {
                throw new Error(`Profile '${profile2Name}' does not exist`);
            }
            
            // Merge strategies
            const strategy = mergeOptions.strategy || 'prefer_second'; // 'prefer_first', 'prefer_second', 'combine'
            
            let mergedData = {};
            let mergedTags = [...new Set([...profile1.tags, ...profile2.tags])];
            let mergedDescription = '';
            
            switch (strategy) {
                case 'prefer_first':
                    mergedData = { ...profile2.data, ...profile1.data };
                    mergedDescription = profile1.description || profile2.description;
                    break;
                    
                case 'prefer_second':
                    mergedData = { ...profile1.data, ...profile2.data };
                    mergedDescription = profile2.description || profile1.description;
                    break;
                    
                case 'combine':
                    // For text fields, combine with separator
                    const allKeys = new Set([...Object.keys(profile1.data), ...Object.keys(profile2.data)]);
                    for (const key of allKeys) {
                        const val1 = profile1.data[key];
                        const val2 = profile2.data[key];
                        
                        if (val1 && val2 && val1 !== val2) {
                            mergedData[key] = `${val1} | ${val2}`;
                        } else {
                            mergedData[key] = val1 || val2;
                        }
                    }
                    mergedDescription = `Merged: ${profile1.description} + ${profile2.description}`;
                    break;
                    
                default:
                    throw new Error(`Unknown merge strategy: ${strategy}`);
            }
            
            // Create merged profile
            const mergedProfile = await this.createProfile(newProfileName, mergedData, {
                description: mergedDescription,
                tags: mergedTags,
                isDefault: false
            });
            
            console.log(`Profiles '${profile1Name}' and '${profile2Name}' merged into '${newProfileName}'`);
            return mergedProfile;

        } catch (error) {
            throw new Error(`Failed to merge profiles: ${error.message}`);
        }
    }

    /**
     * Get the default profile
     * @returns {Promise<Object|null>} Default profile or null if none set
     */
    async getDefaultProfile() {
        const profiles = await this.listProfiles({ isDefault: true });
        return profiles.length > 0 ? await this.getProfile(profiles[0].name) : null;
    }

    /**
     * Set a profile as the default
     * @param {string} name - Profile name
     * @returns {Promise<Object>} Updated profile
     * @throws {Error} If profile doesn't exist
     */
    async setDefaultProfile(name) {
        const profile = await this.getProfile(name);
        if (!profile) {
            throw new Error(`Profile '${name}' does not exist`);
        }
        
        return await this.updateProfile(name, profile.data, { isDefault: true });
    }

    /**
     * Get available profile templates
     * @returns {Promise<Array>} Array of template profiles
     */
    async getTemplates() {
        return await this.listProfiles({ isTemplate: true });
    }

    /**
     * Create a profile from a template
     * @param {string} templateName - Template profile name
     * @param {string} newProfileName - New profile name
     * @param {Object} overrideData - Data to override in template
     * @returns {Promise<Object>} Created profile
     * @throws {Error} If template doesn't exist
     */
    async createFromTemplate(templateName, newProfileName, overrideData = {}) {
        const template = await this.getProfile(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' does not exist`);
        }
        
        if (!template.isTemplate) {
            throw new Error(`Profile '${templateName}' is not a template`);
        }
        
        const mergedData = { ...template.data, ...overrideData };
        
        return await this.createProfile(newProfileName, mergedData, {
            description: `Created from template: ${templateName}`,
            tags: [...template.tags, 'from-template'],
            isDefault: false
        });
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Initialize required directories
     * @private
     */
    async _initializeDirectories() {
        try {
            await this._ensureDirectoryExists(this.profilesDir);
            await this._ensureDirectoryExists(this.backupsDir);
            await this._ensureDirectoryExists(this.templatesDir);
        } catch (error) {
            console.error('Failed to initialize profile directories:', error.message);
        }
    }

    /**
     * Ensure a directory exists
     * @private
     * @param {string} dir - Directory path
     */
    async _ensureDirectoryExists(dir) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * Validate profile name
     * @private
     * @param {string} name - Profile name to validate
     * @throws {Error} If name is invalid
     */
    _validateProfileName(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('Profile name must be a non-empty string');
        }
        
        if (name.length > 100) {
            throw new Error('Profile name must be 100 characters or less');
        }
        
        if (!/^[a-zA-Z0-9_\-\s]+$/.test(name)) {
            throw new Error('Profile name can only contain letters, numbers, spaces, hyphens, and underscores');
        }
    }

    /**
     * Check if a profile exists
     * @private
     * @param {string} name - Profile name
     * @returns {Promise<boolean>} True if profile exists
     */
    async _profileExists(name) {
        try {
            const profilePath = path.join(this.profilesDir, `${name}.json`);
            await fs.access(profilePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save a profile to disk
     * @private
     * @param {Object} profile - Profile object to save
     */
    async _saveProfile(profile) {
        const profilePath = path.join(this.profilesDir, `${profile.name}.json`);
        await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    }

    /**
     * Create a backup of a profile
     * @private
     * @param {Object} profile - Profile to backup
     * @param {string} suffix - Optional suffix for backup filename
     */
    async _createBackup(profile, suffix = null) {
        try {
            await this._ensureDirectoryExists(this.backupsDir);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = suffix 
                ? `${profile.name}_${suffix}.json`
                : `${profile.name}_v${profile.version}_${timestamp}.json`;
            
            const backupPath = path.join(this.backupsDir, backupName);
            await fs.writeFile(backupPath, JSON.stringify(profile, null, 2), 'utf8');
            
            // Keep only the last 10 backups per profile
            await this._cleanupOldBackups(profile.name);
            
        } catch (error) {
            console.warn(`Failed to create backup for profile '${profile.name}':`, error.message);
        }
    }

    /**
     * Save a profile as a template
     * @private
     * @param {Object} profile - Profile to save as template
     */
    async _saveTemplate(profile) {
        try {
            await this._ensureDirectoryExists(this.templatesDir);
            
            const templatePath = path.join(this.templatesDir, `${profile.name}.json`);
            await fs.writeFile(templatePath, JSON.stringify(profile, null, 2), 'utf8');
            
        } catch (error) {
            console.warn(`Failed to save template for profile '${profile.name}':`, error.message);
        }
    }

    /**
     * Clean up old backup files, keeping only the most recent ones
     * @private
     * @param {string} profileName - Profile name to clean backups for
     */
    async _cleanupOldBackups(profileName) {
        try {
            const files = await fs.readdir(this.backupsDir);
            const profileBackups = files
                .filter(file => file.startsWith(profileName) && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(this.backupsDir, file)
                }));
            
            // Sort by modification time (newest first)
            const stats = await Promise.all(
                profileBackups.map(async backup => ({
                    ...backup,
                    stat: await fs.stat(backup.path)
                }))
            );
            
            stats.sort((a, b) => b.stat.mtime - a.stat.mtime);
            
            // Delete all but the most recent 10
            if (stats.length > 10) {
                const toDelete = stats.slice(10);
                await Promise.all(
                    toDelete.map(backup => fs.unlink(backup.path))
                );
            }
            
        } catch (error) {
            console.warn(`Failed to cleanup backups for profile '${profileName}':`, error.message);
        }
    }

    /**
     * Unset default flag on all profiles
     * @private
     */
    async _unsetAllDefaults() {
        try {
            const profiles = await this.listProfiles({ isDefault: true });
            
            for (const profileSummary of profiles) {
                const profile = await this.getProfile(profileSummary.name);
                if (profile && profile.isDefault) {
                    profile.isDefault = false;
                    profile.updatedAt = new Date().toISOString();
                    
                    // Encrypt sensitive fields before saving
                    const encryptedProfile = {
                        ...profile,
                        data: this._encryptSensitiveFields(profile.data)
                    };
                    
                    await this._saveProfile(encryptedProfile);
                }
            }
        } catch (error) {
            console.warn('Failed to unset default profiles:', error.message);
        }
    }

    /**
     * Get or create encryption key for sensitive fields
     * @private
     * @returns {string} Encryption key
     */
    _getOrCreateEncryptionKey() {
        // In a real application, this should use a more secure key management system
        // For this implementation, we'll use a simple approach
        const keyPath = path.join(os.homedir(), '.pdf-filler', '.encryption_key');
        
        try {
            return require('fs').readFileSync(keyPath, 'utf8');
        } catch {
            // Generate new key
            const key = crypto.randomBytes(32).toString('hex');
            try {
                require('fs').mkdirSync(path.dirname(keyPath), { recursive: true });
                require('fs').writeFileSync(keyPath, key, 'utf8');
                // Set restrictive permissions
                require('fs').chmodSync(keyPath, 0o600);
            } catch (error) {
                console.warn('Failed to save encryption key:', error.message);
            }
            return key;
        }
    }

    /**
     * Check if data contains sensitive fields
     * @private
     * @param {Object} data - Data object to check
     * @returns {boolean} True if contains sensitive fields
     */
    _hasSensitiveFields(data) {
        return Object.keys(data).some(key => 
            this.sensitiveFields.some(sensitiveField => 
                key.toLowerCase().includes(sensitiveField)
            )
        );
    }

    /**
     * Encrypt sensitive fields in data object
     * @private
     * @param {Object} data - Data object
     * @returns {Object} Data object with encrypted sensitive fields
     */
    _encryptSensitiveFields(data) {
        const encrypted = { ...data };
        
        for (const [key, value] of Object.entries(data)) {
            if (this._isSensitiveField(key) && value) {
                encrypted[key] = this._encrypt(String(value));
            }
        }
        
        return encrypted;
    }

    /**
     * Decrypt sensitive fields in data object
     * @private
     * @param {Object} data - Data object with encrypted fields
     * @returns {Object} Data object with decrypted sensitive fields
     */
    _decryptSensitiveFields(data) {
        const decrypted = { ...data };
        
        for (const [key, value] of Object.entries(data)) {
            if (this._isSensitiveField(key) && value && this._isEncrypted(value)) {
                try {
                    decrypted[key] = this._decrypt(value);
                } catch (error) {
                    console.warn(`Failed to decrypt field '${key}':`, error.message);
                    decrypted[key] = '[DECRYPTION_FAILED]';
                }
            }
        }
        
        return decrypted;
    }

    /**
     * Check if a field is sensitive and should be encrypted
     * @private
     * @param {string} fieldName - Field name to check
     * @returns {boolean} True if field is sensitive
     */
    _isSensitiveField(fieldName) {
        const lowerFieldName = fieldName.toLowerCase();
        return this.sensitiveFields.some(sensitiveField => 
            lowerFieldName.includes(sensitiveField)
        );
    }

    /**
     * Encrypt a string value
     * @private
     * @param {string} text - Text to encrypt
     * @returns {string} Encrypted text with prefix
     */
    _encrypt(text) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return `ENC:${iv.toString('hex')}:${encrypted}`;
        } catch (error) {
            console.warn('Encryption failed:', error.message);
            return text; // Return original if encryption fails
        }
    }

    /**
     * Decrypt an encrypted string value
     * @private
     * @param {string} encryptedText - Encrypted text to decrypt
     * @returns {string} Decrypted text
     */
    _decrypt(encryptedText) {
        try {
            if (!this._isEncrypted(encryptedText)) {
                return encryptedText;
            }
            
            const parts = encryptedText.split(':');
            if (parts.length !== 3 || parts[0] !== 'ENC') {
                throw new Error('Invalid encrypted format');
            }
            
            const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
            let decrypted = decipher.update(parts[2], 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Check if a value is encrypted
     * @private
     * @param {string} value - Value to check
     * @returns {boolean} True if value is encrypted
     */
    _isEncrypted(value) {
        return typeof value === 'string' && value.startsWith('ENC:');
    }

    /**
     * Validate import data structure
     * @private
     * @param {Object} importData - Data to validate
     * @throws {Error} If data is invalid
     */
    _validateImportData(importData) {
        if (!importData || typeof importData !== 'object') {
            throw new Error('Invalid import data: must be an object');
        }
        
        if (!importData.name || typeof importData.name !== 'string') {
            throw new Error('Invalid import data: missing or invalid name');
        }
        
        if (!importData.data || typeof importData.data !== 'object') {
            throw new Error('Invalid import data: missing or invalid data object');
        }
        
        this._validateProfileName(importData.name);
    }

    /**
     * Generate a unique profile name by adding a suffix
     * @private
     * @param {string} baseName - Base name to make unique
     * @returns {Promise<string>} Unique profile name
     */
    async _generateUniqueProfileName(baseName) {
        let counter = 1;
        let uniqueName = `${baseName}_${counter}`;
        
        while (await this._profileExists(uniqueName)) {
            counter++;
            uniqueName = `${baseName}_${counter}`;
        }
        
        return uniqueName;
    }
}

module.exports = ProfileService;