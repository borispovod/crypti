var async = require('async');

function Module(modules, cb) {
	var public = {};

	function Blockchain(blocks) {
		//тут проверка валидности блоков, ссылка напоследний блок и тд.
		//пока так:
		this.blocks = blocks || [];

		this.push = function(block, cb){

		}
	}

	public.open = function (cb) {

		async.auto({
			blocks: function (cb) {
				modules.db.serialize(function () {
					modules.db.all(
						"SELECT " +
						"b.rowid b_rowid, b.id b_id, b.previousBlock b_previousBlock, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature, " +
						"t.rowid t_rowid, t.id t_id, t.blockId t_blockId, t.blockRowId t_blockRowId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.sender t_sender, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, " +
						"s.rowid s_rowid, s.id s_id, s.transactionId s_transactionId, s.transactionRowId s_transactionRowId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature, " +
						"c.rowid c_rowid, c.id c_id, c.transactionId c_transactionId, c.transactionRowId c_transactionRowId, c.name c_name, c.description c_description, c.domain c_domain, c.email c_email, c.timestamp c_timestamp, c.generatorPublicKey c_generatorPublicKey, c.signature c_signature " +
						"FROM blocks as b " +
						"left outer join trs as t on blockRowId=b.rowid " +
						"left outer join signatures as s on s.transactionRowId=t.rowid " +
						"left outer join companies as c on c.transactionRowId=t.rowid " +
						"ORDER BY height " +
						"", cb);
				})
			}
		}, function (err, scope) {
			if (err) return cb(err);

			var blockchain =  new Blockchain(scope.blocks);

			cb(null, blockchain);
		})
	}

	cb(null, public);
}

module.exports.create = Module;