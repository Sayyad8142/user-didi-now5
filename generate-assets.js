#!/usr/bin/env node

/**
 * Asset Generation Script for Didi Now App
 * 
 * This script generates all platform-specific icons and splash screens
 * from the base source files using @capacitor/assets
 * 
 * Usage: node generate-assets.js
 * Or add to package.json: "assets:gen": "node generate-assets.js"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎨 Generating Capacitor assets for Didi Now...');

// Ensure source files exist
const iconPath = 'resources/base-icon.png';
const splashPath = 'resources/base-splash.png';

if (!fs.existsSync(iconPath)) {
  console.error(`❌ Icon source file not found: ${iconPath}`);
  process.exit(1);
}

if (!fs.existsSync(splashPath)) {
  console.error(`❌ Splash source file not found: ${splashPath}`);
  process.exit(1);
}

try {
  // Generate assets using @capacitor/assets
  console.log('📱 Generating iOS and Android assets...');
  execSync(`npx @capacitor/assets generate --icon ${iconPath} --splash ${splashPath}`, {
    stdio: 'inherit'
  });
  
  console.log('✅ Assets generated successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Run: npx cap sync');
  console.log('2. Build for production: npm run build');
  console.log('3. Open native projects: npx cap open ios/android');
  
} catch (error) {
  console.error('❌ Failed to generate assets:', error.message);
  process.exit(1);
}