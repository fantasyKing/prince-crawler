import Redis from './redis';

const DRILLERINFODB = 'drillerInfoDb'; // 存储了抓取规则及抓取的队列
const URLINFODB = 'urlInfoDb';
const URLREPORTDB = 'urlReportDb';
const PROXYINFODB = 'proxyInfoDb';

export default new class {
  init = async (settings) => {
    await Redis.createClient(DRILLERINFODB,
     settings['driller_info_redis_db'][0],
     settings['driller_info_redis_db'][1],
     settings['driller_info_redis_db'][2]
    );

    await Redis.createClient(URLINFODB,
     settings['url_info_redis_db'][0],
     settings['url_info_redis_db'][1],
     settings['url_info_redis_db'][2]
    );

    await Redis.createClient(URLREPORTDB,
     settings['url_report_redis_db'][0],
     settings['url_report_redis_db'][1],
     settings['url_report_redis_db'][2]
    );

    await Redis.createClient(PROXYINFODB,
     settings['proxy_info_redis_db'][0],
     settings['proxy_info_redis_db'][1],
     settings['proxy_info_redis_db'][2]
    );
  }
};
