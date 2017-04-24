import EventEmitter from 'events';
import urlUtil from 'url';
import util from 'util';

import request from './../lib/http_request';

export default class DownLoader extends EventEmitter {
  constructor(spiderCore) {
    this.spiderCore = spiderCore;
    this.proxyList = [];
    this.timeout_count = 0;
    this.logger = spiderCore.settings.logger;
  }

  assembly = async () => true;

  download = async (urlinfo) => {
    if (urlinfo['jshandle']) {
      this.browseIt(urlinfo);
    } else {
      this.downloadIt(urlinfo);
    }
  }

  downloadIt = async (urlinfo) => {
    const spiderCore = this.spiderCore;
    try {
      const self = this;

      if ('download' in spiderCore.spider_extend) {
        const result = await spiderCore.spider_extend.download(urlinfo);
        if (!result) {
          self.downloadItAct(urlinfo);
        } else {
          spiderCore.emit('crawled', result);
        }
      } else {
        self.downloadItAct(urlinfo);
      }
    } catch (err) {
      this.logger.error('spider.downloader.error = ', err);
      spiderCore.emit('crawling_failure', urlinfo, err);
    }
  }

/**
 * download page action use http request
 */
  downloadItAct = async (urlinfo) => {
    const spiderCore = this.spiderCore;
    try {
      const pageLink = urlinfo['url'];
      const startTime = new Date();

      const urlobj = urlUtil.parse(pageLink);

      const options = {
        uri: urlobj,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like NeoCrawler) Chrome/31.0.1650.57 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.6,en;q=0.4',
          Referer: urlinfo['referer'] || '',
          host: urlobj['host'],
          Cookie: this.transCookieKvPair(urlinfo['cookie'])
        }
      };

      this.logger.debug(util.format('Request start, %s', pageLink));

      const { res, body } = await request.get(options);

      const result = {
        remote_proxy: res.headers['remoteproxy'],
        drill_count: 0,
        cookie: res.headers['Cookie'],
        url: urlinfo['url'],
        origin: urlinfo,
        statusCode: res.statusCode,
        content: body,
        cost: (new Date()) - startTime
      };

      if (result['url'].startsWith('/')) {
        result['url'] = urlUtil.resolve(pageLink, result['url']);
      }

      spiderCore.emit('crawled', result);
    } catch (err) {
      this.logger.error('err = ', err);
      spiderCore.emit('crawling_failure', urlinfo, err.message);
    }
  }

  transCookieKvPair = (cookieArr) => {
    if (!Array.isArray(cookieArr)) {
      return '';
    }
    const kvarray = [];
    for (const cookie of cookieArr) {
      kvarray.push(`${cookie['name']}=${cookie['value']}`);
    }
    return kvarray.join(';');
  }
}
