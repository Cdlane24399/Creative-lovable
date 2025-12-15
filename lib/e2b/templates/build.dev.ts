import { config } from 'dotenv';
import { resolve } from 'path';
import { Template, defaultBuildLogger } from 'e2b';
import { template } from './template';

// Load .env.local from project root
config({ path: resolve(__dirname, '../../../.env.local') });

async function buildDev() {
  // Verify API key is loaded
  if (!process.env.E2B_API_KEY) {
    console.error('❌ E2B_API_KEY not found in environment variables');
    console.error('   Please add E2B_API_KEY=e2b_*** to your .env.local file');
    process.exit(1);
  }

  console.log('🚀 Building E2B template for development...');
  console.log(`   API Key: ${process.env.E2B_API_KEY.substring(0, 10)}...`);

  try {
    await Template.build(template, {
      alias: 'creative-lovable-nextjs-dev',
      cpuCount: 2,
      memoryMB: 2048,
      onBuildLogs: defaultBuildLogger(),
    });
    
    console.log('✅ Template built successfully!');
    console.log(`📋 Template alias: creative-lovable-nextjs-dev`);
    console.log('\n💡 To use this template:');
    console.log(`   Set E2B_TEMPLATE_ID="creative-lovable-nextjs-dev" in your .env.local file`);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildDev();
