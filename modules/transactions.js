var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	timeHelper = require("../helpers/time.js"),
	params = require('../helpers/params.js'),
	extend = require('extend');

var Router = require('../helpers/router.js');
var async = require('async');

var commonTransactions = [
	'17161723217299671792',
	'14954593607769777081',
	'388343932064254716',
	'16666601751214758791',
	'13517474272446611832',
	'16361023175826014146',
	'5762858625501160608',
	'6580641196386813279',
	'2570871179450701270',
	'18161712215732841469',
	'1288601880448653652',
	'1592885482599800278',
	'6496770978185889128',
	'15599625088508862066',
	'11209788941517400353',
	'5776100264687373015',
	'13866386024348289933',
	'3831536144857205630',
	'6847754892515621020',
	'8735348689308967138',
	'12579362549178302916',
	'14019110617192229679',
	'6496770978185889128',
	'2593288169226938423',
	'60844618883282289',
	'15599625088508862066',
	'11209788941517400353',
	'15685420827429704739',
	'14557610340442433002',
	'2708784286128233148',
	'590315316848613356',
	'3696996145980806938',
	'426890441623548487',
	'14429611521033795447',
	'7391565274775858369',
	'2085846860005800711',
	'14466943938445898125',
	'10217791285618277836',
	'17748205394558895061',
	'7895821531692803387',
	'501699509982917191',
	'6156225414296006485',
	'4807083844985825825',
	'2776744587077804497',
	'3121660426369863840'
];

var commonBlocks = [
	'14013222133873100123',
	'17412217808380777861',
	'4091186027665270276',
	'10412095294536712576',
	'7898695225829906453',
	'6578121990960100316',
	'770951543429801054',
	'14373692742031792672',
	'2062565971081620340',
	'9739110381591220682',
	'12568309574251800434',
	'5010725149053910188',
	'10773022402342502744',
	'12467968393581047591',
	'4104901146928523488',
	'4449746969444776600',
	'13964104500028146304',
	'2906684949126054218',
	'6549822160560764397',
	'8377495347646865609',
	'9628723657815699110',
	'15948635179336353543',
	'2853707746294962032',
	'10850792926353370305',
	'17678613583820647342',
	'14924124478470477782',
	'15788455546458102541',
	'9994911580881317293',
	'9153363563364692276',
	'4551343435893081947',
	'2770906097245203312',
	'5200762029931201979',
	'16069122559772159233',
	'8882057668907177868',
	'9242082238044365007',
	'2770123817778701936',
	'13015184702874597807',
	'10367845680838448102',
	'4247472282524521228',
	'17300477078631155',
	'6832013690373646127',
	'5005796358561102935',
	'2492319385237517590',
	'10288518832494523103',
	'6812000314691825388',
	'1591715405968860555',
	'14579565605427279594',
	'1094967524933103798',
	'15936673640002621634',
	'17118365028888729851',
	'18196050394372804998',
	'11928855691762891223',
	'4056529462792246703',
	'18138605278099469205',
	'17071830976780955329',
	'17191488902037842734',
	'6351977080406155123',
	'15668166067235728113',
	'4878174693475244479',
	'4072264787954290053',
	'17143856118015907026',
	'7536483606105547467',
	'8499922929680681408',
	'11430007142725907928',
	'9283267930899748188',
	'17631496289211167512',
	'3872152152817495329',
	'342865586572255958',
	'4956048252490065887',
	'11884282451776717126',
	'10389015120621211962',
	'7553898098804485098',
	'8033718138085751030',
	'16638078303454992729',
	'11532919822132559305',
	'15525593235354770300',
	'11409043237105364924',
	'5728739644006697181',
	'130850034624364328',
	'10547490330983138924',
	'15907719850047525508',
	'16233109610304340565',
	'1776465526652757722',
	'592613553981802537',
	'11624922224056945111',
	'5844022908560141457',
	'15136199369908603175',
	'5515160871254461538',
	'18411368071700846378',
	'14184758599516765548',
	'11717655258385624653',
	'4454087872272047504',
	'10787286741490038798',
	'10634562942329518109',
	'11542860110142770946',
	'8972950168051309565',
	'13908591389461516710',
	'2351237736979892906',
	'13691807592306524551',
	'4080435673110529993',
	'16137517779237628003',
	'2373794476874914625',
	'4590495921434705444',
	'6643308118982346548',
	'5208267259909134078',
	'10813081725872838256',
	'10799692466325858584',
	'10245426222364241887',
	'5211405957250973591',
	'2303670496573647667'
]

// private
var modules, library, self;
var unconfirmedTransactions, doubleSpendingTransactions;
var hiddenTransactions = [];

function Transactions(cb, scope) {
	library = scope;
	unconfirmedTransactions = {};
	doubleSpendingTransactions = {};
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		var blockId = req.query.blockId;
		var limit = req.query.limit;
		var orderBy = req.query.orderBy;
		var offset = req.query.offset;
		var senderPublicKey = req.query.senderPublicKey;
		var recipientId = req.query.recipientId;
		var senderId = req.query.senderId;

		self.list({
			senderId: senderId,
			blockId: blockId,
			senderPublicKey: senderPublicKey,
			recipientId: recipientId,
			limit: limit || 20,
			orderBy: orderBy,
			offset: offset,
			hex: true
		}, function (err, transactions) {
			if (err) {
				return res.json({success: false, error: "Transactions not found"});
			}

			res.json({success: true, transactions: transactions});
		});
	});

	router.get('/get', function (req, res) {
		var id = params.string(req.query.id);
		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		self.get(id, true, function (err, transaction) {
			if (!transaction || err) {
				return res.json({success: false, error: "Transaction not found"});
			}
			res.json({success: true, transaction: transaction});
		});
	});

	router.get('/unconfirmed/get', function (req, res) {
		var id = params.string(req.query.id);

		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		var transaction = extend(true, {}, self.getUnconfirmedTransaction(id));

		if (!transaction) {
			return res.json({success: false, error: "Transaction not found"});
		}

		delete transaction.asset;
		transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
		transaction.signature = transaction.signature.toString('hex');
		transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

		res.json({success: true, transaction: transaction});
	});

	router.get('/unconfirmed/', function (req, res) {
		var transactions = self.getUnconfirmedTransactions(true),
			toSend = [];

		var senderPublicKey = params.string(req.query.senderPublicKey),
			address = params.string(req.query.address);

		if (senderPublicKey || address) {
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i].senderPublicKey.toString('hex') == senderPublicKey || transactions[i].recipientId == address) {
					var transaction = extend(true, {}, transactions[i]);

					delete transaction.asset;
					transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
					transaction.signature = transaction.signature.toString('hex');
					transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

					toSend.push(transaction);
				}
			}
		} else {
			for (var i = 0; i < transactions.length; i++) {
				var transaction = extend(true, {}, transactions[i]);

				delete transaction.asset;
				transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
				transaction.signature = transaction.signature.toString('hex');
				transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

				toSend.push(transaction);
			}
		}

		res.json({success: true, transactions: toSend});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			amount = params.int(req.body.amount),
			recipientId = params.string(req.body.recipientId),
			publicKey = params.buffer(req.body.publicKey, 'hex'),
			secondSecret = params.string(req.body.secondSecret);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (publicKey.length > 0) {
			if (keypair.publicKey.toString('hex') != publicKey.toString('hex')) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var transaction = {
			type: 0,
			subtype: 0,
			amount: amount,
			recipientId: recipientId,
			senderPublicKey: account.publicKey,
			timestamp: timeHelper.getNow()
		};

		self.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret || secondSecret.length == 0) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			self.secondSign(secondSecret, transaction);
		}

		library.sequence.add(function (cb) {
			self.processUnconfirmedTransaction(transaction, true, cb);
		}, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}

			res.json({success: true, transactionId: transaction.id});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/transactions', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/transactions', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Transactions.prototype.sign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signature = ed.Sign(hash, keypair);
}

Transactions.prototype.secondSign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signSignature = ed.Sign(hash, keypair);
}

Transactions.prototype.list = function (filter, cb) {
	var sortFields = ['t.id', 't.blockId', 't.type', 't.subtype', 't.timestamp', 't.senderPublicKey', 't.senderId', 't.recipientId', 't.amount', 't.fee', 't.signature', 't.signSignature', 't.confirmations'];
	var parameters = {}, fields = [];
	if (filter.blockId) {
		fields.push('blockId = $blockId')
		parameters.blockId = params.string(filter.blockId);
	}
	if (filter.senderPublicKey) {
		fields.push('hex(senderPublicKey) = $senderPublicKey')
		parameters.senderPublicKey = params.buffer(filter.senderPublicKey, 'hex').toString('hex').toUpperCase();
	}
	if (filter.senderId) {
		fields.push('senderId = $senderId');
		parameters.senderId = params.string(filter.senderId);
	}
	if (filter.recipientId) {
		fields.push('recipientId = $recipientId')
		parameters.recipientId = params.string(filter.recipientId);
	}
	if (filter.limit) {
		parameters.limit = params.int(filter.limit);
	}
	if (filter.offset) {
		parameters.offset = params.int(filter.offset);
	}

	if (filter.orderBy) {
		filter.orderBy = params.string(filter.orderBy);
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "t." + sortBy;
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		} else {
			sortMethod = "desc";
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid sort field");
		}
	}

	if (params.int(filter.limit) > 1000) {
		return cb('Maximum of limit is 1000');
	}

	library.dbLite.query("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, hex(t.senderPublicKey) t_senderPublicKey,  t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, hex(t.signature) t_signature, hex(t.signSignature) t_signSignature, (select max(height) + 1 from blocks) - b.height as confirmations " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	(fields.length ? "where " + fields.join(' or ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
	(filter.limit ? 'limit $limit' : '') + " " +
	(filter.offset ? 'offset $offset' : ''), parameters, ['t_id', 't_blockId', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
		if (err) {
			return cb(err)
		}

		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, blockHelper.getTransaction(row, true, filter.hex));
		}, cb)
	});
}

Transactions.prototype.get = function (id, hex, cb) {
	library.dbLite.query("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, hex(t.senderPublicKey) t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, hex(t.signature) t_signature, hex(t.signSignature) t_signSignature, hex(c_t.generatorPublicKey) t_companyGeneratorPublicKey, (select max(height) + 1 from blocks) - b.height as confirmations " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	"where t.id = $id", {id: id}, ['t_id', 't_blockId', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_companyGeneratorPublicKey', 'confirmations'], function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Can't find transaction: " + id);
		}

		var transacton = blockHelper.getTransaction(rows[0], true, hex);
		cb(null, transacton);
	});
}

Transactions.prototype.getUnconfirmedTransaction = function (id) {
	return unconfirmedTransactions[id];
}

Transactions.prototype.getUnconfirmedTransactions = function (sort) {
	var a = [];

	for (var id in unconfirmedTransactions) {
		a.push(unconfirmedTransactions[id]);
	}

	if (sort) {
		a.sort(function compare(a, b) {
			if (a.timestamp > b.timestamp)
				return -1;
			if (a.timestamp < b.timestamp)
				return 1;
			return 0;
		});
	}

	return a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	if (unconfirmedTransactions[id]) {
		delete unconfirmedTransactions[id];
	}
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
	var txId = transactionHelper.getId(transaction);

	if (transaction.id && transaction.id != txId) {
		cb && setImmediate(cb, "Invalid transaction id");
		return;
	} else {
		transaction.id = txId;
	}

	delete transaction.blockId;

	library.dbLite.query("SELECT id FROM trs WHERE id=$id", {id: transaction.id}, ['id'], function (err, rows) {
		if (err) {
			cb && cb("Internal sql error");
			return;
		}

		if (rows.length > 0) {
			cb && cb("Can't process transaction, transaction already confirmed");
			return;
		} else {
			// check in confirmed transactions
			if (unconfirmedTransactions[transaction.id] || doubleSpendingTransactions[transaction.id]) {
				cb && cb("This transaction already exists");
				return;
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

			if (!sender) {
				cb && cb("Can't process transaction, sender not found");
				return;
			}

			transaction.senderId = sender.address;

			if (!self.verifySignature(transaction)) {
				cb && cb("Can't verify signature");
				return;
			}

			if (sender.secondSignature) {
				if (!self.verifySecondSignature(transaction, sender.secondPublicKey)) {
					cb && cb("Can't verify second signature");
					return;
				}
			}

			// check if transaction is not float and great then 0
			if (transaction.amount < 0) {
				cb && cb("Invalid transaction amount");
				return;
			}

			if (transaction.amount) {
				if (transaction.amount.toString().indexOf("e") >= 0 || transaction.amount.toString().indexOf(".") >= 0) {
					return cb("Invalid transaction amount: " + transaction.id);
				}
			}

			if (transaction.timestamp > timeHelper.getNow() + 15) {
				cb && cb("Invalid transaction timestamp");
				return;
			}

			var fee = transactionHelper.getFee(transaction, modules.blocks.getFee());

			if (fee <= 0) {
				fee = 1;
			}

			transaction.fee = fee;

			switch (transaction.type) {
				case 0:
					switch (transaction.subtype) {
						case 0:
							if (!transaction.recipientId) {
								cb && cb("Invalid recipient id");
								return;
							}

							if (transactionHelper.getLastChar(transaction) != "C") {
								cb && cb("Invalid transaction recipient id");
								return;
							}
							break;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 1:
					switch (transaction.subtype) {
						case 0:
							cb && cb("Not supporting transaction");
							return;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 2:
					switch (transaction.subtype) {
						case 0:
							if (!transaction.asset.signature) {
								cb && cb("Empty transaction asset for company transaction");
								return;
							}

							if (!transaction.asset.signature.publicKey) {
								cb && cb("Invalid public key");
								return;
							}

							if (transaction.asset.signature.publicKey.length != 32) {
								cb && cb("Invalid public key");
								return;
							}

							if (transaction.asset.signature.generatorPublicKey.length != 32) {
								cb && cb("Invalid generator public key");
								return;
							}

							if (transaction.asset.signature.generationSignature.length != 64) {
								cb && cb("Invalid generation signature");
								return;
							}

							if (transaction.asset.signature.signature.length != 64) {
								cb && cb("Invalid generation signature");
								return;
							}

							if (transaction.recipientId) {
								cb && cb("Invalid recipientId");
								return;
							}
							break;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 3:
					switch (transaction.subtype) {
						case 0:
							cb && cb("Companies doesn't supports now");
							return;
						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				default:
					cb && cb("Unknown transaction type");
					return;
			}

			async.parallel([
				function (cb) {
					if (transaction.type == 1 && transaction.subtype == 0) {
						library.dbLite.query("SELECT id FROM companies WHERE address = $address", {address: transaction.recipientId}, ['id'], function (err, rows) {
							if (err) {
								return cb("Internal sql error");
							}

							if (rows.length > 0) {
								cb();
							} else {
								cb("Company with this address as recipient not found");
							}
						});
					} else {
						setImmediate(cb);
					}
				}
			], function (err) {
				if (err) {
					return cb && cb(err);
				}

				if (!self.applyUnconfirmed(transaction)) {
					doubleSpendingTransactions[transaction.id] = transaction;
					return cb && cb("Can't apply transaction: " + transaction.id);
				}

				transaction.asset = transaction.asset || {};
				unconfirmedTransactions[transaction.id] = transaction;

				library.bus.message('unconfirmedTransaction', transaction, broadcast)

				cb && cb(null, transaction.id);

			});
		}
	});
}

Transactions.prototype.applyUnconfirmedList = function (ids) {
	for (var i = 0; i < ids.length; i++) {
		var transaction = unconfirmedTransactions[ids[i]];
		if (!this.applyUnconfirmed(transaction)) {
			delete unconfirmedTransactions[ids[i]];
			doubleSpendingTransactions[ids[i]] = transaction;
		}
	}
}

Transactions.prototype.undoAllUnconfirmed = function () {
	var ids = Object.keys(unconfirmedTransactions);
	for (var i = 0; i < ids.length; i++) {
		var transaction = unconfirmedTransactions[ids[i]];
		this.undoUnconfirmed(transaction);
	}

	return ids;
}

Transactions.prototype.pushHiddenTransaction = function (transaction) {
	hiddenTransactions.push(transaction);
}

Transactions.prototype.shiftHiddenTransaction = function () {
	return hiddenTransactions.shift();
}

Transactions.prototype.deleteHiddenTransaction = function () {
	hiddenTransactions = [];
}

Transactions.prototype.apply = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	if (commonTransactions.indexOf(transaction.id) < 0 && (sender.balance < amount && transaction.blockId != genesisblock.blockId)) {
		return false;
	}

	// process only two types of transactions
	if (transaction.type == 0) {
		if (transaction.subtype == 0) {
			sender.addToBalance(-amount);

			var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
			recipient.addToUnconfirmedBalance(transaction.amount);
			recipient.addToBalance(transaction.amount);

			return true;
		}
	} else if (transaction.type == 1) {
		if (transaction.subtype == 0) {
			return false;
		}
	} else if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			sender.addToBalance(-amount);

			sender.unconfirmedSignature = false;
			sender.secondSignature = true;
			sender.secondPublicKey = transaction.asset.signature.publicKey;
			return true;
		}
	} else {
		return true;
	}
}

Transactions.prototype.applyUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	if (!sender && transaction.blockId != genesisblock.blockId) {
		return false;
	} else {
		sender = modules.accounts.getAccountOrCreate(transaction.senderPublicKey);
	}

	if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			if (sender.unconfirmedSignature || sender.secondSignature) {
				return false;
			}

			sender.unconfirmedSignature = true;
		}
	}

	var amount = transaction.amount + transaction.fee;

	if (sender.unconfirmedBalance < amount && transaction.blockId != genesisblock.blockId) {
		if (commonTransactions.indexOf(transaction.id) < 0 ) {
			if (commonBlocks.indexOf(transaction.blockId) < 0) {
				if (transaction.type == 2) {
					sender.unconfirmedSignature = false;
				}

				return false;
			}
		}
	}

	sender.addToUnconfirmedBalance(-amount);

	return true;
}

Transactions.prototype.undoUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToUnconfirmedBalance(amount);

	if (transaction.type == 2 && transaction.subtype == 0) {
		sender.unconfirmedSignature = false;
	}

	return true;
}


Transactions.prototype.undo = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToBalance(amount);

	// process only two types of transactions
	if (transaction.type == 0) {
		if (transaction.subtype == 0) {
			var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
			recipient.addToUnconfirmedBalance(-transaction.amount);
			recipient.addToBalance(-transaction.amount);

			return true;
		}
	} else if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			sender.secondSignature = false;
			sender.unconfirmedSignature = true;
			sender.secondPublicKey = null;

			return true;
		}
	} else {
		return true;
	}
}

Transactions.prototype.parseTransaction = function (transaction) {
	transaction.asset = transaction.asset || {}; //temp

	transaction.id = params.string(transaction.id);
	transaction.blockId = params.string(transaction.blockId);
	transaction.type = params.int(transaction.type);
	transaction.subtype = params.int(transaction.subtype);
	transaction.timestamp = params.int(transaction.timestamp);
	transaction.senderPublicKey = params.buffer(transaction.senderPublicKey);
	transaction.senderId = params.string(transaction.senderId);
	transaction.recipientId = params.string(transaction.recipientId);
	transaction.amount = params.int(transaction.amount);
	transaction.fee = params.int(transaction.fee);
	transaction.signature = params.buffer(transaction.signature);

	if (transaction.signSignature) {
		transaction.signSignature = params.buffer(transaction.signSignature);
	}

	if (transaction.type == 2 && transaction.subtype == 0) {
		transaction.asset.signature = modules.signatures.parseSignature(params.object(params.object(transaction.asset).signature));
	}

	if (transaction.type == 3 && transaction.subtype == 0) {
		transaction.asset.company = modules.companies.parseCompany(params.object(params.object(transaction.asset).company))
	}

	return transaction;
}

Transactions.prototype.verifySignature = function (transaction) {
	if (transaction.signature.length != 64 || transaction.senderPublicKey.length != 32) {
		return false;
	}

	var remove = 64;

	if (transaction.signSignature) {
		remove = 128;
	}

	var bytes = transactionHelper.getBytes(transaction);
	var data2 = new Buffer(bytes.length - remove);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var res = ed.Verify(hash, transaction.signature || ' ', transaction.senderPublicKey || ' ');
	} catch (e) {
		library.logger.info("first signature");
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

Transactions.prototype.verifySecondSignature = function (transaction, publicKey) {
	if (transaction.signSignature.length != 64 || publicKey.length != 32) {
		return false;
	}

	var bytes = transactionHelper.getBytes(transaction);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var res = ed.Verify(hash, transaction.signSignature || ' ', publicKey || ' ');
	} catch (e) {
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

Transactions.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Transactions;