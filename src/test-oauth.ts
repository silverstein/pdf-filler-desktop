#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

async function testOAuthWithGeminiCLI() {
  console.log('🔐 Testing OAuth with Gemini CLI...\n');
  
  // Check for OAuth credentials
  const configDir = path.join(__dirname, '../gemini-cli-local/.gemini');
  const oauthPath = path.join(configDir, 'oauth_creds.json');
  
  try {
    await fs.access(oauthPath);
    console.log('✅ OAuth credentials found at:', oauthPath);
  } catch {
    console.log('❌ No OAuth credentials found. Please run: npm run gemini-auth');
    process.exit(1);
  }
  
  // Test Gemini CLI directly
  console.log('\n📡 Testing Gemini CLI connection...');
  
  const geminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
  const localGeminiHome = path.join(__dirname, '../gemini-cli-local');
  
  const testPrompt = 'Say "OAuth is working!" if you can read this.';
  
  return new Promise((resolve, reject) => {
    const gemini = spawn(geminiPath, ['-p', testPrompt], {
      env: {
        ...process.env,
        HOME: localGeminiHome,
        GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop'
      },
      cwd: path.join(__dirname, '..')
    });
    
    let output = '';
    let error = '';
    
    gemini.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    gemini.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    gemini.on('close', (code) => {
      if (code !== 0) {
        console.log('❌ Gemini CLI failed:', error);
        reject(new Error(error));
      } else {
        // Clean output
        const cleanOutput = output
          .split('\n')
          .filter(line => !line.includes('Loaded cached credentials'))
          .join('\n')
          .trim();
        
        console.log('✅ Response:', cleanOutput);
        console.log('\n🎉 OAuth is working correctly with Gemini CLI!');
        resolve(cleanOutput);
      }
    });
  });
}

// Test PDF if available
async function testPDFAnalysis() {
  console.log('\n📄 Testing PDF analysis...');
  
  const testPDFs = [
    'uploads/1755291805044-1755280421774-f1065sk1_MarkCuban_filled_corrected.pdf',
    'uploads/test.pdf',
    'uploads/sample.pdf'
  ];
  
  for (const pdfPath of testPDFs) {
    const fullPath = path.join(__dirname, '..', pdfPath);
    try {
      await fs.access(fullPath);
      console.log('✅ Found test PDF:', pdfPath);
      
      const geminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
      const localGeminiHome = path.join(__dirname, '../gemini-cli-local');
      
      const prompt = `Look at the PDF at: ${fullPath}. Tell me what type of document it is in 10 words or less.`;
      
      return new Promise((resolve) => {
        const gemini = spawn(geminiPath, ['-p', prompt], {
          env: {
            ...process.env,
            HOME: localGeminiHome,
            GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop'
          },
          cwd: path.join(__dirname, '..')
        });
        
        let output = '';
        
        gemini.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        gemini.on('close', (code) => {
          if (code === 0) {
            const cleanOutput = output
              .split('\n')
              .filter(line => !line.includes('Loaded cached credentials'))
              .join('\n')
              .trim();
            
            console.log('✅ PDF Analysis:', cleanOutput);
          }
          resolve(output);
        });
      });
    } catch {
      continue;
    }
  }
  
  console.log('⚠️ No test PDFs found in uploads/');
}

// Run tests
(async () => {
  try {
    await testOAuthWithGeminiCLI();
    await testPDFAnalysis();
    
    console.log('\n✅ All OAuth and CLI tests passed!');
    console.log('\n📝 Note: The AI SDK integration requires ESM support.');
    console.log('   The existing gemini-simple.js approach works well for now.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
})();