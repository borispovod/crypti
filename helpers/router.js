/**
 * @title Router
 * @overview Router stub
 * @returns {*}
 */
module.exports = function () {
    var router = require('express').Router();

    router.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    //router.param(function (name, fn) {
    //	if (fn instanceof RegExp) {
    //		return function (req, res, next, val) {
    //			var captures;
    //			if (captures = fn.exec(String(val))) {
    //				req.params[name] = captures.length == 1 ? captures[0] : captures;
    //				next();
    //			} else {
    //				next('route');
    //			}
    //		}
    //	}
    //});
    //
    //router.param('id', /^[0-9]+$/);

    return router;
};