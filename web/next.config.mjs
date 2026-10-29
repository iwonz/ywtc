import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export default {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(root, '..'),
  poweredByHeader: false,
  devIndicators: false,
  experimental: {cpus: 2},
  webpack(config) {
    config.resolve.extensionAlias = {...config.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js']};
    return config;
  },
};
