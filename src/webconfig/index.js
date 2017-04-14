/**
 * Created on 7/5/16.
 */
import HTTP from './server/http';
import simpleLogger from 'simple-logger';

global.logger = simpleLogger.getLogger('prince-crawler');
/**
 * 先写成这样方便测试，实际上，起动是通过src/index.js中的命令行启动。
 */
async function main() {
  try {
    const router = require('./route');
    const port = process.env.PORT || 5555;
    const server = new HTTP({ port });
    server.use(router.Router);
    server.start();
    logger.info(`server start at ${port}`);
  } catch (e) {
    logger.error('main.error =', e);
  }
}

main();
