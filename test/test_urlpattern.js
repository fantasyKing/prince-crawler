import test from 'ava';

test('urlpattern', async t => {
  try {
    let url = 'http://www.8btc.com/yapizon-confirms-5-mln';
    url = 'http://www.8btc.com/sitemap?cat=324234&pg=12344';
    // url = 'http://www.8btc.com/sitemap';
    // const urlPattern = new RegExp('^http://www.8btc.com/(\\w+-\\w+)+$', 'ig');
    const urlPattern = new RegExp('^http://www.8btc.com/sitemap\\?(cat=\\d*)?(&?pg=(\\d*))?$', 'ig');
    console.log('result--->', urlPattern.test(url));
    t.truthy(true, 'message');
  } catch (err) {
    console.log('err = ', err);
    t.falsy(false, 'url pattern wrong');
  }
});
