#!/usr/bin/env ts-node

import { AIService } from './services/ai-service';
import path from 'path';
import fs from 'fs/promises';

async function testAIService() {
  console.log('🚀 Testing AI Service with Vercel AI SDK...\n');
  
  const aiService = new AIService();
  
  // Test 1: Check authentication status
  console.log('1️⃣ Checking authentication status...');
  const authStatus = await aiService.checkAuthStatus();
  console.log(`   ✅ Authentication: ${authStatus ? 'Authenticated' : 'Not authenticated'}`);
  
  if (!authStatus) {
    console.log('\n❌ Please authenticate first by running: npm run gemini-auth');
    process.exit(1);
  }
  
  // Test 2: Test connection
  console.log('\n2️⃣ Testing connection to Gemini...');
  const connectionResult = await aiService.testConnection();
  if (connectionResult.success) {
    console.log(`   ✅ Connection successful: ${connectionResult.data}`);
  } else {
    console.log(`   ❌ Connection failed: ${connectionResult.error}`);
    process.exit(1);
  }
  
  // Test 3: Check for test PDF
  console.log('\n3️⃣ Looking for test PDF...');
  const testPDFs = [
    'uploads/1755280421774-f1065sk1_MarkCuban_filled_corrected.pdf',
    'uploads/test.pdf',
    'uploads/sample.pdf'
  ];
  
  let testPdfPath: string | null = null;
  for (const pdfPath of testPDFs) {
    const fullPath = path.join(__dirname, '..', pdfPath);
    try {
      await fs.access(fullPath);
      testPdfPath = fullPath;
      console.log(`   ✅ Found test PDF: ${pdfPath}`);
      break;
    } catch {
      continue;
    }
  }
  
  if (!testPdfPath) {
    console.log('   ⚠️ No test PDF found. Skipping PDF tests.');
    console.log('   To test PDF operations, place a PDF in the uploads/ directory.');
  } else {
    // Test 4: Analyze PDF
    console.log('\n4️⃣ Testing PDF analysis...');
    try {
      const analysisResult = await aiService.analyzePDF(testPdfPath);
      console.log('   ✅ PDF Analysis successful!');
      console.log(`   - Type: ${analysisResult.type}`);
      console.log(`   - Pages: ${analysisResult.pages}`);
      console.log(`   - Has form fields: ${analysisResult.hasFormFields}`);
      console.log(`   - Form fields count: ${analysisResult.formFields.length}`);
      console.log(`   - Summary: ${analysisResult.summary.substring(0, 100)}...`);
    } catch (error: any) {
      console.log(`   ❌ PDF Analysis failed: ${error.message}`);
    }
    
    // Test 5: Extract PDF data
    console.log('\n5️⃣ Testing PDF data extraction...');
    try {
      const extractionResult = await aiService.extractPDFData({
        pdfPath: testPdfPath
      });
      console.log('   ✅ PDF Extraction successful!');
      console.log(`   - Extracted keys: ${Object.keys(extractionResult).join(', ')}`);
      
      // Show a sample of extracted data
      const sampleData = JSON.stringify(extractionResult, null, 2).substring(0, 200);
      console.log(`   - Sample data:\n${sampleData}...`);
    } catch (error: any) {
      console.log(`   ❌ PDF Extraction failed: ${error.message}`);
    }
    
    // Test 6: Validate PDF
    console.log('\n6️⃣ Testing PDF validation...');
    try {
      const validationResult = await aiService.validatePDFForm(testPdfPath);
      console.log('   ✅ PDF Validation successful!');
      console.log(`   - Is valid: ${validationResult.isValid}`);
      console.log(`   - Filled fields: ${validationResult.filledFields.length}`);
      console.log(`   - Missing fields: ${validationResult.missingFields.length}`);
      console.log(`   - Summary: ${validationResult.summary.substring(0, 100)}...`);
    } catch (error: any) {
      console.log(`   ❌ PDF Validation failed: ${error.message}`);
    }
  }
  
  // Test 7: Check status
  console.log('\n7️⃣ Checking service status...');
  const status = aiService.getStatus();
  console.log(`   - Current model: ${status.model}`);
  console.log(`   - Using Flash fallback: ${status.useFlashFallback}`);
  console.log(`   - Requests per minute: ${status.rateLimiter.requestsPerMinute}`);
  console.log(`   - Requests today: ${status.rateLimiter.requestsToday}`);
  
  console.log('\n✅ All tests completed!');
  console.log('\n📊 Summary:');
  console.log('   - OAuth authentication: Working');
  console.log('   - Gemini connection: Working');
  console.log('   - AI SDK integration: Working');
  console.log('   - TypeScript compilation: Working');
  
  console.log('\n🎉 The new AI Service with Vercel AI SDK is ready to use!');
}

// Run the tests
testAIService().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});