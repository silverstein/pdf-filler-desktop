import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Type definitions for profile operations
interface ProfileData {
  [key: string]: any;
}

interface ProfileMetadata {
  fieldCount: number;
  hasEncryptedFields: boolean;
}

interface Profile {
  name: string;
  description: string;
  data: ProfileData;
  tags: string[];
  isDefault: boolean;
  isTemplate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  metadata: ProfileMetadata;
}

interface ProfileSummary {
  name: string;
  description: string;
  tags: string[];
  isDefault: boolean;
  isTemplate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  metadata: ProfileMetadata;
}

interface ProfileOptions {
  description?: string;
  tags?: string[];
  isDefault?: boolean;
  isTemplate?: boolean;
}

interface ProfileFilters {
  tags?: string[];
  isDefault?: boolean;
  isTemplate?: boolean;
}

interface ImportOptions {
  overwrite?: boolean;
  rename?: boolean;
}

interface MergeOptions {
  strategy?: 'prefer_first' | 'prefer_second' | 'combine';
}

interface ExportData {
  name: string;
  description: string;
  data: ProfileData;
  tags: string[];
  isTemplate: boolean;
  exportedAt: string;
  exportedFrom: string;
  metadata?: ProfileMetadata;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * ProfileService - Manages user profiles for PDF form filling
 * Stores profiles securely in user's home directory with encryption for sensitive fields
 */
export class ProfileService {
  private profilesDir: string;
  private backupsDir: string;
  private templatesDir: string;
  private encryptionKey: string;
  private sensitiveFields: string[];

  constructor() {
    this.profilesDir = path.join(os.homedir(), '.pdf-filler', 'profiles');
    this.backupsDir = path.join(os.homedir(), '.pdf-filler', 'backups');
    this.templatesDir = path.join(os.homedir(), '.pdf-filler', 'templates');
    this.encryptionKey = this.getOrCreateEncryptionKey();
    
    // Fields that should be encrypted
    this.sensitiveFields = [
      'ssn', 'social_security_number', 'tax_id', 'ein',
      'password', 'pin', 'account_number', 'routing_number',
      'credit_card', 'debit_card', 'bank_account',
      'driver_license', 'passport', 'license_number'
    ];
    
    // Initialize directories
    this.initializeDirectories();
  }

  /**
   * Create a new profile
   */
  async createProfile(name: string, data: ProfileData, options: ProfileOptions = {}): Promise<Profile> {
    try {
      // Validate profile name
      this.validateProfileName(name);
      
      // Check if profile already exists
      if (await this.profileExists(name)) {
        throw new Error(`Profile '${name}' already exists`);
      }

      // Create profile object
      const profile: Profile = {
        name: name.trim(),
        description: options.description || '',
        data: this.encryptSensitiveFields(data),
        tags: Array.isArray(options.tags) ? options.tags : [],
        isDefault: Boolean(options.isDefault),
        isTemplate: Boolean(options.isTemplate),
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          fieldCount: Object.keys(data).length,
          hasEncryptedFields: this.hasSensitiveFields(data)
        }
      };

      // If this is marked as default, unset other defaults
      if (profile.isDefault) {
        await this.unsetAllDefaults();
      }

      // Save profile
      await this.saveProfile(profile);
      
      // Create backup
      await this.createBackup(profile);

      // Save as template if requested
      if (profile.isTemplate) {
        await this.saveTemplate(profile);
      }

      console.log(`Profile '${name}' created successfully`);
      return profile;

    } catch (error: any) {
      throw new Error(`Failed to create profile: ${error.message}`);
    }
  }

  /**
   * Retrieve a profile by name
   */
  async getProfile(name: string): Promise<Profile | null> {
    try {
      this.validateProfileName(name);
      
      const profilePath = path.join(this.profilesDir, `${name}.json`);
      
      try {
        await fs.access(profilePath);
      } catch {
        return null; // Profile doesn't exist
      }

      const profileData = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(profileData) as Profile;
      
      // Decrypt sensitive fields
      profile.data = this.decryptSensitiveFields(profile.data);
      
      return profile;

    } catch (error: any) {
      throw new Error(`Failed to retrieve profile '${name}': ${error.message}`);
    }
  }

  /**
   * Update an existing profile
   */
  async updateProfile(name: string, data: ProfileData, options: Partial<ProfileOptions> = {}): Promise<Profile> {
    try {
      this.validateProfileName(name);
      
      // Check if profile exists
      const existingProfile = await this.getProfile(name);
      if (!existingProfile) {
        throw new Error(`Profile '${name}' does not exist`);
      }

      // Create backup of current version
      await this.createBackup(existingProfile);

      // Update profile
      const updatedProfile: Profile = {
        ...existingProfile,
        data: this.encryptSensitiveFields(data),
        description: options.description !== undefined ? options.description : existingProfile.description,
        tags: options.tags !== undefined ? options.tags : existingProfile.tags,
        isDefault: options.isDefault !== undefined ? options.isDefault : existingProfile.isDefault,
        version: existingProfile.version + 1,
        updatedAt: new Date().toISOString(),
        metadata: {
          fieldCount: Object.keys(data).length,
          hasEncryptedFields: this.hasSensitiveFields(data)
        }
      };

      // If this is marked as default, unset other defaults
      if (updatedProfile.isDefault && !existingProfile.isDefault) {
        await this.unsetAllDefaults();
      }

      // Save updated profile
      await this.saveProfile(updatedProfile);

      console.log(`Profile '${name}' updated successfully (version ${updatedProfile.version})`);
      
      // Return with decrypted data
      updatedProfile.data = this.decryptSensitiveFields(updatedProfile.data);
      return updatedProfile;

    } catch (error: any) {
      throw new Error(`Failed to update profile '${name}': ${error.message}`);
    }
  }

  /**
   * Delete a profile
   */
  async deleteProfile(name: string): Promise<boolean> {
    try {
      this.validateProfileName(name);
      
      const profilePath = path.join(this.profilesDir, `${name}.json`);
      
      try {
        await fs.access(profilePath);
      } catch {
        return false; // Profile doesn't exist
      }

      // Create final backup before deletion
      const profile = await this.getProfile(name);
      if (profile) {
        await this.createBackup(profile, `deleted_${Date.now()}`);
      }

      // Delete profile file
      await fs.unlink(profilePath);
      
      console.log(`Profile '${name}' deleted successfully`);
      return true;

    } catch (error: any) {
      throw new Error(`Failed to delete profile '${name}': ${error.message}`);
    }
  }

  /**
   * List all available profiles
   */
  async listProfiles(filters: ProfileFilters = {}): Promise<ProfileSummary[]> {
    try {
      await this.ensureDirectoryExists(this.profilesDir);
      
      const files = await fs.readdir(this.profilesDir);
      const profileFiles = files.filter(file => file.endsWith('.json'));
      
      const profiles: ProfileSummary[] = [];
      
      for (const file of profileFiles) {
        try {
          const profilePath = path.join(this.profilesDir, file);
          const profileData = await fs.readFile(profilePath, 'utf8');
          const profile = JSON.parse(profileData) as Profile;
          
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
          
        } catch (parseError: any) {
          console.warn(`Skipping corrupted profile file: ${file}`, parseError.message);
        }
      }
      
      // Sort by updatedAt (most recent first)
      profiles.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      return profiles;

    } catch (error: any) {
      throw new Error(`Failed to list profiles: ${error.message}`);
    }
  }

  /**
   * Export a profile to a file
   */
  async exportProfile(name: string, outputPath: string, includeMetadata: boolean = true): Promise<string> {
    try {
      const profile = await this.getProfile(name);
      if (!profile) {
        throw new Error(`Profile '${name}' does not exist`);
      }

      // Prepare export data (with decrypted sensitive fields)
      const exportData: ExportData = {
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

    } catch (error: any) {
      throw new Error(`Failed to export profile '${name}': ${error.message}`);
    }
  }

  /**
   * Import a profile from a file
   */
  async importProfile(filePath: string, options: ImportOptions = {}): Promise<Profile> {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read and parse file
      const fileData = await fs.readFile(filePath, 'utf8');
      const importData = JSON.parse(fileData) as ExportData;
      
      // Validate import data
      this.validateImportData(importData);
      
      let profileName = importData.name;
      
      // Handle name conflicts
      if (await this.profileExists(profileName)) {
        if (options.overwrite) {
          console.log(`Overwriting existing profile '${profileName}'`);
        } else if (options.rename) {
          profileName = await this.generateUniqueProfileName(profileName);
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

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Import file not found: ${filePath}`);
      }
      throw new Error(`Failed to import profile: ${error.message}`);
    }
  }

  /**
   * Get the default profile
   */
  async getDefaultProfile(): Promise<Profile | null> {
    const profiles = await this.listProfiles({ isDefault: true });
    return profiles.length > 0 ? await this.getProfile(profiles[0].name) : null;
  }

  /**
   * Set a profile as the default
   */
  async setDefaultProfile(name: string): Promise<Profile> {
    const profile = await this.getProfile(name);
    if (!profile) {
      throw new Error(`Profile '${name}' does not exist`);
    }
    
    return await this.updateProfile(name, profile.data, { isDefault: true });
  }

  // Private methods

  private async initializeDirectories(): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.profilesDir);
      await this.ensureDirectoryExists(this.backupsDir);
      await this.ensureDirectoryExists(this.templatesDir);
    } catch (error: any) {
      console.error('Failed to initialize profile directories:', error.message);
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private validateProfileName(name: string): void {
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

  private async profileExists(name: string): Promise<boolean> {
    try {
      const profilePath = path.join(this.profilesDir, `${name}.json`);
      await fs.access(profilePath);
      return true;
    } catch {
      return false;
    }
  }

  private async saveProfile(profile: Profile): Promise<void> {
    const profilePath = path.join(this.profilesDir, `${profile.name}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
  }

  private async createBackup(profile: Profile, suffix: string | null = null): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.backupsDir);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = suffix 
        ? `${profile.name}_${suffix}.json`
        : `${profile.name}_v${profile.version}_${timestamp}.json`;
      
      const backupPath = path.join(this.backupsDir, backupName);
      await fs.writeFile(backupPath, JSON.stringify(profile, null, 2), 'utf8');
      
      // Keep only the last 10 backups per profile
      await this.cleanupOldBackups(profile.name);
      
    } catch (error: any) {
      console.warn(`Failed to create backup for profile '${profile.name}':`, error.message);
    }
  }

  private async saveTemplate(profile: Profile): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.templatesDir);
      
      const templatePath = path.join(this.templatesDir, `${profile.name}.json`);
      await fs.writeFile(templatePath, JSON.stringify(profile, null, 2), 'utf8');
      
    } catch (error: any) {
      console.warn(`Failed to save template for profile '${profile.name}':`, error.message);
    }
  }

  private async cleanupOldBackups(profileName: string): Promise<void> {
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
      
      stats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
      
      // Delete all but the most recent 10
      if (stats.length > 10) {
        const toDelete = stats.slice(10);
        await Promise.all(
          toDelete.map(backup => fs.unlink(backup.path))
        );
      }
      
    } catch (error: any) {
      console.warn(`Failed to cleanup backups for profile '${profileName}':`, error.message);
    }
  }

  private async unsetAllDefaults(): Promise<void> {
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
            data: this.encryptSensitiveFields(profile.data)
          };
          
          await this.saveProfile(encryptedProfile);
        }
      }
    } catch (error: any) {
      console.warn('Failed to unset default profiles:', error.message);
    }
  }

  private getOrCreateEncryptionKey(): string {
    // In a real application, this should use a more secure key management system
    const keyPath = path.join(os.homedir(), '.pdf-filler', '.encryption_key');
    
    try {
      return fsSync.readFileSync(keyPath, 'utf8');
    } catch {
      // Generate new key
      const key = crypto.randomBytes(32).toString('hex');
      try {
        fsSync.mkdirSync(path.dirname(keyPath), { recursive: true });
        fsSync.writeFileSync(keyPath, key, 'utf8');
        // Set restrictive permissions
        fsSync.chmodSync(keyPath, 0o600);
      } catch (error: any) {
        console.warn('Failed to save encryption key:', error.message);
      }
      return key;
    }
  }

  private hasSensitiveFields(data: ProfileData): boolean {
    return Object.keys(data).some(key => 
      this.sensitiveFields.some(sensitiveField => 
        key.toLowerCase().includes(sensitiveField)
      )
    );
  }

  private encryptSensitiveFields(data: ProfileData): ProfileData {
    const encrypted = { ...data };
    
    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key) && value) {
        encrypted[key] = this.encrypt(String(value));
      }
    }
    
    return encrypted;
  }

  private decryptSensitiveFields(data: ProfileData): ProfileData {
    const decrypted = { ...data };
    
    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key) && value && this.isEncrypted(value)) {
        try {
          decrypted[key] = this.decrypt(value);
        } catch (error: any) {
          console.warn(`Failed to decrypt field '${key}':`, error.message);
          decrypted[key] = '[DECRYPTION_FAILED]';
        }
      }
    }
    
    return decrypted;
  }

  private isSensitiveField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return this.sensitiveFields.some(sensitiveField => 
      lowerFieldName.includes(sensitiveField)
    );
  }

  private encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey, 'hex'), iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return `ENC:${iv.toString('hex')}:${encrypted}`;
    } catch (error: any) {
      console.warn('Encryption failed:', error.message);
      return text; // Return original if encryption fails
    }
  }

  private decrypt(encryptedText: string): string {
    try {
      if (!this.isEncrypted(encryptedText)) {
        return encryptedText;
      }
      
      const parts = encryptedText.split(':');
      if (parts.length !== 3 || parts[0] !== 'ENC') {
        throw new Error('Invalid encrypted format');
      }
      
      const iv = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey, 'hex'), iv);
      let decrypted = decipher.update(parts[2], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  private isEncrypted(value: any): boolean {
    return typeof value === 'string' && value.startsWith('ENC:');
  }

  private validateImportData(importData: any): void {
    if (!importData || typeof importData !== 'object') {
      throw new Error('Invalid import data: must be an object');
    }
    
    if (!importData.name || typeof importData.name !== 'string') {
      throw new Error('Invalid import data: missing or invalid name');
    }
    
    if (!importData.data || typeof importData.data !== 'object') {
      throw new Error('Invalid import data: missing or invalid data object');
    }
    
    this.validateProfileName(importData.name);
  }

  private async generateUniqueProfileName(baseName: string): Promise<string> {
    let counter = 1;
    let uniqueName = `${baseName}_${counter}`;
    
    while (await this.profileExists(uniqueName)) {
      counter++;
      uniqueName = `${baseName}_${counter}`;
    }
    
    return uniqueName;
  }
}

export default ProfileService;