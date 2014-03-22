
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('front/index', { title: 'Express' });
};