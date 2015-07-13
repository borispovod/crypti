var extend = require('extend');

function map (root, map) {
	var router = this;
	Object.keys(map).forEach(function (route) {
		router[map[route].method](route, function (req, res, next) {
			root[map[route].call](map[route].method == "get" ? req.query : req.body, function (err, response) {
				if (err) {
					res.json({success: false, error: err});
				} else {
					return res.json(extend({}, {success: true}, response));
				}
			});
		});
	});
}

/**
 * @title Router
 * @overview Router stub
 * @returns {*}
 */
var Router = function () {
	var router = require('express').Router();

	router.use(function (req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	router.map = map;

	return router;
}

module.exports = Router;