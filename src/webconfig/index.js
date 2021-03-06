/**
 * Created on 7/5/16.
 */
// import simpleLogger from 'simple-logger';

import HTTP from './server/http';
import RedisClient from './../lib/redis_client_init';

// global.logger = simpleLogger.getLogger('prince-crawler');
/**
 * 先写成这样方便测试，实际上，起动是通过src/index.js中的命令行启动。
 */

// const settings = {
//   driller_info_redis_db: ['127.0.0.1', 6379, 0], // /*网址规则配置信息存储位置，最后一个数字表示redis的第几个数据库*/
//   url_info_redis_db: ['127.0.0.1', 6379, 1], // /*网址信息存储位置*/
//   url_report_redis_db: ['127.0.0.1', 6379, 2], // /*抓取错误信息存储位置*/
//   proxy_info_redis_db: ['127.0.0.1', 6379, 3], // /*http代理网址存储位置*/
//   use_proxy: false, // /*是否使用代理服务*/
//   proxy_router: '127.0.0.1:2013', // /*使用代理服务的情况下，代理服务的路由中心地址*/
//   download_timeout: 60, // /*下载超时时间，秒，不等同于相应超时*/
//   save_content_to_hbase: false, // /*是否将抓取信息存储到hbase，目前只在0.94下测试过*/
//   crawled_hbase_conf: ['localhost', 8080], // /*hbase rest的配置,你可以使用tcp方式连接,配置为{'zookeeperHosts': ['localhost:2181'],'zookeeperRoot': '/hbase'},此模式下有OOM Bug,不建议使用*/
//   crawled_hbase_table: 'crawled', // /*抓取的数据保存在hbase的表*/
//   crawled_hbase_bin_table: 'crawled_bin', // /*抓取的二进制数据保存在hbase的表*/
//   statistic_mysql_db: ['127.0.0.1', 3306, 'crawling', 'crawler', '123'], // /*用来存储抓取日志分析结果，需要结合flume来实现，一般不使用此项*/
//   check_driller_rules_interval: 120, // /*多久检测一次网址规则的变化以便热刷新到运行中的爬虫*/
//   spider_concurrency: 5, // /*爬虫的抓取页面并发请求数*/
//   spider_request_delay: 0, // /*两个并发请求之间的间隔时间，秒*/
//   schedule_interval: 60, // /*调度器两次调度的间隔时间*/
//   schedule_quantity_limitation: 200, // /*调度器给爬虫的最大网址待抓取数量*/
//   download_retry: 3, // /*错误重试次数*/
//   log_level: 'DEBUG', // /*日志级别*/
//   use_ssdb: false, // /*是否使用ssdb*/
//   to_much_fail_exit: false, // /*错误太多的时候是否自动终止爬虫*/
//   keep_link_relation: false // /*链接库里是否存储链接间关系*/
// };
// async function main() {
//   try {
//     await RedisClient.init(settings);
//     const router = require('./route');
//     const port = process.env.PORT || 5555;
//     const server = new HTTP({ port });
//     server.use(router.Router);
//     server.start();
//     logger.info(`server start at ${port}`);
//   } catch (e) {
//     logger.error('main.error =', e);
//   }
// }

// main();

export default class WebConfigService {
  constructor(settings) {
    this.settings = settings;
    global.logger = settings.logger;
    this.port = process.env.PORT || settings.port;
  }

  start = async () => {
    try {
      await RedisClient.init(this.settings);
      const router = require('./route');
      const port = process.env.PORT || this.port;
      const server = new HTTP({ port: this.port });
      server.use(router.Router);
      server.start();
      logger.info(`server start at ${port}`);
    } catch (e) {
      logger.error('webwervice start.error =', e);
    }
  }
}
