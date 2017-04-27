import test from 'ava';

test('urlpattern', async t => {
  try {
    let url = 'http://www.8btc.com/yapizon-confirms-5-mln';
    // url = 'http://www.8btc.com/india?page=1';
    // url = 'http://www.8btc.com/sitemap';
    // const urlPattern = new RegExp('^http://www.8btc.com/(\\w+-\\w+)+$', 'ig');
    const urlPattern = new RegExp('^http://www.8btc.com/(\\w+-)+\\w+$', 'ig');
    console.log('result--->', urlPattern.test(url));
    t.truthy(true, 'message');
  } catch (err) {
    console.log('err = ', err);
    t.falsy(false, 'url pattern wrong');
  }
});
