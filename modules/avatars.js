var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js');

var modules, library, self;

function Avatar() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;

		trs.asset.avatar = {
			image : data.image
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 200 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.avatar) {
			return cb("Invalid asset");
		}

		if (!trs.asset.avatar.image) {
			return cb("Invalid message");
		}

		if (trs.amount != 0) {
			return cb("Invalid amount");
		}

		if (trs.recipientId) {
			return cb("Invalid recipient id");
		}

		try {
			var image = new Buffer(trs.asset.avatar.image, 'hex');

			if (image.length > 10000 || image.length == 0) {
				return cb("Invalid image");
			}
		} catch (e) {
			return cb("Invalid hex image");
		}

		return cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var image = new Buffer(trs.asset.avatar.image, 'hex');

			var bb = new ByteBuffer(images.length, true);
			for (var i = 0; i < images.length; i++) {
				bb.writeByte(image[i]);
			}

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}

		return bb.toBuffer()
	}

	this.objectNormalize = function (trs) {
		trs.asset.avatar = RequestSanitizer.validate(trs.asset.avatar, {
			object: true,
			properties: {
				images: "hex!"
			}
		}).value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.a_image) {
			return null;
		} else {
			var avatar = {
				transactionId: raw.t_id,
				image: raw.a_image
			}

			return {avatar: avatar};
		}
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get("/", function (req, res) {
		// return image
		res.send("text");
	});

	router.put("/", function (req, res) {
		// put image transaction
	});

	router.use(function (req, res) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/avatars', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/avatars', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err.toString()});
	});
}

function Avatars(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.AVATAR, new Avatar());

	setImmediate(cb, null, self);
}

Avatars.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Avatars;