import { Template } from 'e2b';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the Dockerfile content
const dockerfileContent = readFileSync(join(__dirname, 'nextjs-shadcn.e2b.Dockerfile'), 'utf-8');

// Create template from Dockerfile
export const template = Template()
  .fromDockerfile(dockerfileContent);
