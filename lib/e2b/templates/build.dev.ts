import 'dotenv/config';
import { Template, defaultBuildLogger } from 'e2b';
import { template } from './template';

async function buildDev() {
  console.log('🚀 Building E2B template for development...');
  
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
