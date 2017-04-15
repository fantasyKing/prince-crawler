export default class {
  ok = (res, page, data) => res.render(page, data);

  fail = (res) => (err) => res.render('error/error', { err });
}
