import 'dotenv/config';
import { Template, defaultBuildLogger } from 'e2b';
import { template } from './template';

async function buildProd() {
  console.log('🚀 Building E2B template for production...');
  
  try {
    await Template.build(template, {
      alias: 'creative-lovable-nextjs',
      cpuCount: 2,
      memoryMB: 2048,
      onBuildLogs: defaultBuildLogger(),
    });
    
    console.log('✅ Template built successfully!');
    console.log(`📋 Template alias: creative-lovable-nextjs`);
    console.log('\n💡 To use this template:');
    console.log(`   Set E2B_TEMPLATE_ID="creative-lovable-nextjs" in your .env.local file`);
    console.log('\n📦 This is the production-ready template.');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildProd();
