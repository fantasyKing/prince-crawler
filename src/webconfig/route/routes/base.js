export default class {
  ok = (res, page, data) => {
    data.panelBodyInvisible = data.panelBodyInvisible || false;
    return res.render(page, data);
  }

  fail = (res) => (err) => res.render('error/error', { err });

  redirect = (res, url) => res.redirect(url);
}
