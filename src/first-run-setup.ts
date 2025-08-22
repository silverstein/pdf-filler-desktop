import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';

export class FirstRunSetup {
  private configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), '.first-run-complete');
  }

  async isFirstRun(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return false; // File exists, not first run
    } catch {
      return true; // File doesn't exist, is first run
    }
  }

  async performSetup(): Promise<void> {
    try {
      // Create necessary directories
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      const tempDir = path.join(app.getPath('userData'), 'temp');
      
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(tempDir, { recursive: true });
      
      // Mark first run as complete
      await fs.writeFile(this.configPath, new Date().toISOString());
      
      console.log('First run setup completed');
    } catch (error) {
      console.error('First run setup failed:', error);
      throw error;
    }
  }
}

export default FirstRunSetup;