import EventEmitter from 'events';
import util from 'util';

import Util from './../lib/util';
import Spider from './spider';
import DownLoder from './downloader';
import Extractor from './extractor';
import Pipeline from './pipeline';

export default class SpiderCore extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.spider = new Spider(this);
    this.downloader = new DownLoder(this);
    this.extractor = new Extractor(this);
    this.pipeline = new Pipeline(this);
    this.spider_extend = {};
    this.logger = settings.logger;
  }

  assembly = async () => {
    try {
      await this.spider.assembly();
      await this.downloader.assembly();
      await this.extractor.assembly();
      await this.pipeline.assembly();
      if ('assembly' in this.spider_extend) await this.spider_extend.assembly();
      this.spider.refreshDrillerRules();
    } catch (err) {
      this.logger.error('spidercore err = ', err);
      throw err;
    }
  }

  start = async () => {
    const spiderCore = this;

    // when get a new url from candidate queue
    spiderCore.on('new_url_queue', (urlinfo) => {
      try {
        spiderCore.spider.updateLinkState(urlinfo['url'], 'crawling');

        spiderCore.downloader.download(urlinfo);

        if ('crawl_start_alert' in spiderCore.spider_extend) {
          spiderCore.spider_extend.crawl_start_alert(urlinfo);
        }
      } catch (err) {
        spiderCore.logger.error('spiderCore.event.new_url_queue---->', err);
      }
    });

    // when downloading is finish
    spiderCore.on('crawled', async (crawled_info) => {
      try {
        spiderCore.logger.info(`crawl ${crawled_info['url']} finish, proxy: ${crawled_info['remote_proxy']}, cost: ${((new Date()).getTime() - parseInt(crawled_info['origin']['start_time']))} ms`);

        spiderCore.emit('slide_queue');

        if (await spiderCore.extractor.validateContent(crawled_info)) {
          let extracted_info = await spiderCore.extractor.extract(crawled_info);

          if ('extract' in spiderCore.spider_extend) {
            const new_extracted_info = await spiderCore.spider_extend.extract(extracted_info);
            if (new_extracted_info) {
              extracted_info = new_extracted_info;
            }
          }

          await spiderCore.pipeline.save(extracted_info);

          await spiderCore.spider.updateLinkState(crawled_info['url'], 'crawled_finish');

          if ('crawl_finish_alert' in spiderCore.spider_extend) await spiderCore.spider_extend.crawl_finish_alert(crawled_info);

          if (extracted_info) {
            if (extracted_info['gc']) extracted_info = null; // FGC
            else extracted_info['gc'] = true;
          }
        } else {
          spiderCore.logger.error(util.format('invalidate content %s', crawled_info['url']));

          crawled_info['origin']['void_proxy'] = crawled_info['remote_proxy'];

          spiderCore.spider.retryCrawl(Util.clone(crawled_info['origin']));
        }
      } catch (err) {
        spiderCore.logger.error('spiderCore.event.crawled---->', err);
      }
    });

    // when downloading is failure
    spiderCore.on('crawling_failure', (urlinfo, err_msg) => {
      try {
        spiderCore.logger.warn(util.format('Crawling failure: %s, reason: %s', urlinfo['url'], err_msg));

        spiderCore.spider.retryCrawl(urlinfo);
      } catch (err) {
        spiderCore.logger.error('spiderCore.event.crawling_failure--->', err);
      }
    });

    // when downloading is break
    spiderCore.on('crawling_break', (urlinfo, err_msg) => {
      try {
        spiderCore.logger.warn(util.format('Crawling break: %s, reason: %s', urlinfo['url'], err_msg));

        spiderCore.spider.retryCrawl(urlinfo);
      } catch (err) {
        spiderCore.logger.error('spiderCore.event.crawling_break--->', err);
      }
    });

    // pop a finished url, append a new url
    spiderCore.on('slide_queue', () => {
      if (spiderCore.spider.queue_length > 0) spiderCore.spider.queue_length--; // queue_length 并发请求数
    });

    // once driller reles loaded
    spiderCore.once('driller_rules_loaded', () => {
      try {
        if (this.checkQueueTimer) {
          clearInterval(this.checkQueueTimer);
          this.checkQueueTimer = null;
        }
        const spider = this.spider;

        const checkQueueTimer = setInterval(() => {
          spider.checkQueue();
        }, spiderCore.settings['spider_request_delay'] * 1000 + 10);
        this.checkQueueTimer = checkQueueTimer;
      } catch (err) {
        spiderCore.logger.error('spiderCore.event.driller_rules_loaded---->', err);
      }
    });

    // trigger
    try {
      await spiderCore.assembly();
    } catch (err) {
      spiderCore.logger.error('spiderCore assembly err', err);
      throw err;
    }
  }

  // test url//////////////////////////////////////////////

  test = async (link) => {
    const self = this;

    this.on('standby', (middleware) => {
      this.logger.debug(`${middleware} stand by`);
      delete this.unavailable_middlewares[middleware];
      if (Util.isEmpty(this.unavailable_middlewares)) {
        this.logger.debug('All middlewares stand by');
        this.removeAllListeners('standby');
        this.spider.refreshDrillerRules();
      }
    });

    this.on('crawled', async (crawled_info) => {
      this.logger.debug(`crawl ${crawled_info['url']} finish`);
      if (!(await this.extractor.validateContent(crawled_info))) {
        this.logger.error(util.format('invalidate content %s', crawled_info['url']));
        return;
      }

      const extracted_info = await this.extractor.extract(crawled_info);

      if ('extract' in self.spider_extend) {
        const extend_extracted_info = await self.spider_extend.extract(extracted_info);
        await self.pipeline.save(extend_extracted_info);
      } else {
        await self.pipeline.save(extracted_info);
      }
    });

    this.once('driller_rules_loaded', async () => {
      const urlinfo = await this.spider.wrapLink(link);
      if (urlinfo !== null) {
        await this.downloader.download(urlinfo);
      } else {
        this.logger.error(`no related rules in configure!, ${link}`);
      }
    });

    // trigger
    try {
      await this.assembly();
    } catch (err) {
      this.logger.error('spiderCore test error ', err);
    }
  }
}
