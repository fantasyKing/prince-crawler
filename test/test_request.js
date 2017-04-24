import test from 'ava';
import rq from 'request-promise';
import url from 'url';

import cusReq from './../src/lib/http_request';

test.skip('req', async t => {
  try {
    const options = {
      uri: 'http://www.dongqiudi.com/',
      method: 'GET'
    };
    const result = await rq(options);
    console.log('result---->', result);
    t.truthy(true, 'req success');
  } catch (err) {
    console.log('err =', err);
    t.falsy(false, 'req error');
  }
});

test('customeReq', async t => {
  try {
    const options = {
      uri: url.parse('http://www.dongqiudi.com/'),
      method: 'GET',
      gzip: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like NeoCrawler) Chrome/31.0.1650.57 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.6,en;q=0.4',
        'Accept-Encoding': 'gzip',
      }
    };
    const result = await cusReq.get(options);
    console.log('result---->', result);
    t.truthy(true, 'customeReq success');
  } catch (err) {
    console.log('err', err);
    t.falsy(false, 'customeReq error');
  }
});

