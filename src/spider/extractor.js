import url from 'url';
import _ from 'lodash';
import querystring from 'querystring';
import util from 'util';
import cheerio from 'cheerio';
import { AllHtmlEntities } from 'html-entities';

import Util from './../lib/util';

const Entities = new AllHtmlEntities();

export default class Extractor {
  constructor(spiderCore) {
    this.spiderCore = spiderCore;
    this.logger = spiderCore.settings.logger;
    this.cumulative_failure = 0;
  }

  assembly = async () => true;

  /**
   * According rules extracting all links from html string
   * @param content
   * @param rules
   * @returns {Array}
   */
  extract_link = async ($, rules) => {
    const links = [];

    for (let i = 0; i < rules.length; i++) {
      $(rules[i]).each(function (index, elem) {
        if (elem['name'] === 'img') {
          links.push($(this).attr('src'));
        } else {
          links.push($(this).attr('href'));
        }
      });
    }
    return links;
  }

  __getTopLevelDomain = (domain) => {
    if (!domain) return null;
    const arr = domain.split('.');

    if (arr.length <= 2) {
      return domain;
    }
    return arr.slice(1).join('.');
  }

  wash_link = async (pageurl, links) => {
    const cleaned_link = [];

    for (let i = 0; i < links.length; i++) {
      if (!links[i]) continue;
      const link = links[i].trim();
      if (!(link.startsWith('#') || link.startsWith('javascript') || link.startsWith('void('))) {
        try {
          const the_url = url.resolve(pageurl, link);
          if (the_url !== pageurl) cleaned_link.push(the_url);
        } catch (e) {
          this.logger.error(`exactor.wash_link Url resolve error: ${pageurl}, ${link}`);
        }
      }
    }
    return _.uniq(cleaned_link);
  }

  /**
   * detect link which drill rule matched
   * @param link
   * @returns [alias name,alias]
   */
  detectLink = async (link) => {
    const urlobj = url.parse(link);
    let result = [];
    const domain = this.__getTopLevelDomain(urlobj['hostname']);

    if (domain && this.spiderCore.spider.driller_rules[domain] !== undefined) {
      const alias = this.spiderCore.spider.driller_rules[domain];

      const domain_rules = Object.keys(alias).sort((a, b) => alias[b]['url_pattern'].length - alias[a]['url_pattern'].length);

      for (let i = 0; i < domain_rules.length; i++) {
        const current_rule = domain_rules[i];
        const url_pattern = decodeURIComponent(alias[current_rule]['url_pattern']);
        const patt = new RegExp(url_pattern);

        if (patt.test(link)) {
          result = [`driller:${domain}:${current_rule}`, alias[current_rule]];
          break;
        }
      }
    }

    return result;
  }

  /**
   * arrange link array.
   * @param links
   * @returns {{}}
   */
  arrange_link = async (links) => {
    const linkobj = {};

    for (let i = 0; i < links.length; i++) {
      let link = links[i];
      const matched_driller = await this.detectLink(link);

      if (matched_driller.length > 0) {
        const driller_lib = `urllib:${matched_driller[0]}`;
        let driller_rule = matched_driller[1];

        if (typeof(driller_rule) !== 'object') driller_rule = JSON.parse(driller_rule);

        if (linkobj[driller_lib] === undefined) linkobj[driller_lib] = [];

        if (driller_rule['id_parameter'] && driller_rule['id_parameter'].length > 0) {
          const id_parameter = driller_rule['id_parameter'];
          const urlobj = url.parse(link);
          const parameters = querystring.parse(urlobj.query);
          const new_parameters = {};

          for (let x = 0; x < id_parameter.length; x++) {
            const param_name = id_parameter[x];
            if (x === 0 && param_name === '#') break;
            if (parameters.hasOwnProperty(param_name)) new_parameters[param_name] = parameters[param_name];
          }

          urlobj.search = querystring.stringify(new_parameters);
          link = url.format(urlobj);
        }

        linkobj[driller_lib].push(link);
      }
    }

    for (const key of Object.keys(linkobj)) {
      if (linkobj.hasOwnProperty(key)) {
        linkobj[key] = _.uniq(linkobj[key]);
      }
    }

    return linkobj;
  }

  /**
   * generate drill relation string: page->sub page->sub page
   * @param crawl_info
   * @returns string
   */
  getDrillRelation = async ($, crawl_info) => {
    const rule = await this.spiderCore.spider.getDrillerRule(crawl_info['origin']['urllib'], 'drill_relation');
    let origin_relation = crawl_info['origin']['drill_relation'];

    if (!origin_relation) origin_relation = '*';

    let new_relation = '*';

    if (rule) {
      switch (rule['mode']) {
        case 'regex':
          if (rule['base'] === 'url') {
            new_relation = await this.regexSelector(crawl_info['url'], rule['expression'], rule['index']);
          } else {
            new_relation = await this.regexSelector(crawl_info['content'], rule['expression'], rule['index']);
          }
          break;
        case 'css':
        default:
          new_relation = await this.cssSelector($.root(), rule['expression'], rule['pick'], rule['index']);
          break;
      }
    }

    return util.format('%s->%s', origin_relation, new_relation);
  }

  /**
   * extractor: for now , just extract links
   * @param crawl_info
   * @returns {*}
   */
  extract = async (crawl_info) => {
    const extract_rule = await this.spiderCore.spider.getDrillerRule(crawl_info['origin']['urllib'], 'extract_rule');

    if (crawl_info['origin']['drill_rules'] || extract_rule['rule']) {
      const $ = cheerio.load(crawl_info['content']);

      let drill_link = '';
      if (crawl_info['origin']['drill_rules']) {
        if (crawl_info['drill_link']) {
          drill_link = crawl_info['drill_link'];
        } else {
          drill_link = await this.extract_link($, crawl_info['origin']['drill_rules']);
        }

        const washed_link = await this.wash_link(crawl_info['url'], drill_link);

        crawl_info['drill_link'] = await this.arrange_link(washed_link);

        if (this.spiderCore.settings['keep_link_relation']) {
          crawl_info['drill_relation'] = await this.getDrillRelation($, crawl_info);
        }
      }

      if (extract_rule['rule'] && !Util.isEmpty(extract_rule['rule'])) {
        const extracted_data = await this.extract_data(crawl_info['url'], crawl_info['content'], extract_rule, null, $.root());
        crawl_info['extracted_data'] = extracted_data;
      }
    }

    return crawl_info;
  }

  extract_data = async (urlLink, content, extract_rule, uppper_data, dom) => {
    const data = {};
    const self = this;

    if (extract_rule['category']) data['category'] = extract_rule['category'];
    if (extract_rule['relate'])data['relate'] = uppper_data[extract_rule['relate']];

    for (const key of Object.keys(extract_rule['rule'])) {
      if (extract_rule['rule'].hasOwnProperty(key)) {
        const rule = extract_rule['rule'][key];
        let baser = content;

        if (rule['base'] === 'url') baser = urlLink;

        switch (rule['mode']) {
          case 'regex': {
            const tmp_result = await this.regexSelector(baser, rule['expression'], rule['index']);
            data[key] = tmp_result;
            break;
          }
          case 'xpath':
            break;
          case 'value':
            data[key] = rule['expression'];
            break;
          case 'json':
            break;
          default: { // css selector
            if (dom) {
              baser = dom;
            } else {
              baser = cheerio.load(content);
            }
            let pick = rule['pick'];
            if (rule['subset']) {
              pick = false;
              const result_arr = [];
              const tmp_result = await self.cssSelector(baser, rule['expression'], pick, rule['index']);

              if (tmp_result) {
                tmp_result.each(async (x) => {
                  const sub_dom = tmp_result.eq(x);
                  result_arr.push(await self.extract_data(urlLink, content, rule['subset'], data, sub_dom));
                });
              }

              if (!Util.isEmpty(result_arr)) data[key] = result_arr;
            } else {
              try {
                const tmp_result = await this.cssSelector(baser, rule['expression'], pick, rule['index']);
                if (tmp_result && !Util.isEmpty(tmp_result)) data[key] = tmp_result;
              } catch (e) {
                this.logger.error(`${urlLink} extract field ${key} error: ${e}`);
              }
            }
          }
        }
      }
    }

    if (extract_rule['require']) {
      let lacks = [];

      for (let c = 0; c < extract_rule['require'].length; c++) {
        const key = extract_rule['require'][c];
        if (typeof(key) === 'object') {
          const sublack = await self.checksublack(key, data);
          if (sublack.length > 0) lacks = lacks.concat(sublack);
        } else {
          if (!data[key]) {
            lacks.push(key);
            this.logger.warn(`${key} not found in ${urlLink} extracted data`);
          }
        }
      }

      if (!Util.isEmpty(lacks)) {
        this.logger.error(`${urlLink} extracted data lacks of ${lacks.join(',')}`);
        await self.spiderCore.spider.urlReportDb.zadd('incomplete:data:url', (new Date()).getTime(), urlLink);
        if ('data_lack_alert' in self.spiderCore.spider_extend) self.spiderCore.spider_extend.data_lack_alert(urlLink, lacks);
      } else {
        await self.spiderCore.spider.urlReportDb.zrem('incomplete:data:url', urlLink);
      }
    }

    return data;
  }

  checksublack = async (keys, data) => {
    const sublackarr = [];

    for (let x = 0; x < keys.length; x++) {
      if (!data[keys[x]]) {
        sublackarr.push(keys[x]);
        this.logger.warn(`${keys[x]} not found in ${url} extracted data`);
      }
    }

    if (sublackarr.length === keys.length) return sublackarr;
    return [];
  }

  /**
   * extract value base expression
   * @param $
   * @param expression
   * @param pick
   * @param index
   * @returns {*}
   */
  cssSelector = async ($, expression, pick, index) => {
    if (!index) index = 1;

    const real_index = parseInt(index) - 1;

    const tmp_val = $.find(expression);

    if (!pick) return tmp_val;

    if (typeof(tmp_val) === 'object') {
      if (real_index >= 0) {
        const val = tmp_val.eq(real_index);
        return await this.cssSelectorPicker(val, pick);
      }
      let arrayResult = [];
      for (let i = 0; i < tmp_val.length; i++) {
        const val = tmp_val.eq(i);
        arrayResult.push(await this.cssSelectorPicker(val, pick));
      }
      if (arrayResult.length === 1) arrayResult = arrayResult[0];
      return arrayResult;
    }

    const val = tmp_val;
    return await this.cssSelectorPicker(val, pick);
  }

  cssSelectorPicker = async (val, pick) => {
    let result;
    if (pick.startsWith('@')) {
      result = val.attr(pick.slice(1));
    } else {
      switch (pick.toLowerCase()) {
        case 'text':
        case 'innertext':
          result = val.text();
          break;
        case 'html':
        case 'innerhtml':
          result = val.html();
          result = Entities.decode(result);
          break;
        default:
          break;
      }
    }
    if (result) result = result.trim();
    return result;
  }

  /**
   * return matched group base expression
   * @param content
   * @param expression
   * @param index
   * @returns {*}
   */
  regexSelector = async (content, expression, index) => {
    index = parseInt(index);

    if (index === 0) index = 1;

    expression = new RegExp(expression, 'ig');

    if (index > 0) {
      const matched = expression.exec(content);
      if (matched && matched.length > index) return matched[index];
    }

    const arr = [];
    const matched = expression.exec(content);
    while (matched) {
      arr.push(matched[1]);
    }
    return arr;
  }

  validateContent = async (crawl_info) => {
    const self = this;
    let result = true;
    const statusCode = parseInt(crawl_info['statusCode']);
    let limitation = 500;

    if (crawl_info['origin']['format'] === 'binary') limitation = 20;

    if (statusCode === 200) {
      if (crawl_info['content'].length < limitation) {
        this.logger.error(util.format('Too little content: %s, length:%s', crawl_info['url'], crawl_info['content'].length));
        result = false;
      }

      if (crawl_info['origin']['validation_keywords']) {
        for (let i = 0; i < crawl_info['origin']['validation_keywords'].length; i++) {
          const keyword = crawl_info['origin']['validation_keywords'][i];
          if (crawl_info['content'].indexOf(keyword) < 0) {
            this.logger.error(util.format('%s lacked keyword: %s', crawl_info['url'], keyword));
            result = false;
            break;
          }
        }
      }
    } else {
      this.logger.error(util.format('url:%s, status code: %s', crawl_info['url'], statusCode));
      if (statusCode > 300) result = false; // 30x,40x,50x
    }

    if (self.spiderCore.settings['to_much_fail_exit']) {
      self.cumulative_failure += result ? -1 : 1;
      if (self.cumulative_failure < 0) self.cumulative_failure = 0;
      if (self.cumulative_failure > self.spiderCore.settings['spider_concurrency'] * 1.5) {
        this.logger.fatal(`too much fail, exit. '${self.cumulative_failure}`);
        process.exit(1);
      }
    }

    return result;
  }
}
