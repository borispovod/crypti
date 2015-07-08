var util = require('util');

var errorCodes = {
	VOTES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient %s, in vote transaction recipient is same that sender",
			args: ['recipientId']
		},
		MINIMUM_DELEGATES_VOTE: {
			message: "Empty votes: %s",
			args: ["id"]
		},
		MAXIMUM_DELEGATES_VOTE: {
			message: "You can only vote for a maximum of 33 delegates at any one time: %s",
			args: ["id"]
		},
		ALREADY_VOTED_UNCONFIRMED: {
			message: "Can't verify votes, you already voted for this delegate: %s",
			args: ["id"]
		},
		ALREADY_VOTED_CONFIRMED: {
			message: "Can't verify votes, you already voted for this delegate: %s",
			args: ["id"]
		}
	},
	USERNAMES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient",
			args: []
		},
		INVALID_AMOUNT: {
			message: "Invalid amount of transaction: %s",
			args: ["id"]
		},
		EMPTY_ASSET: {
			message: "Empty transaction asset for username transaction: %s",
			args: ["id"]
		},
		ALLOW_CHARS: {
			message: "Username can only contain alphanumeric characters with the exception of !@$&_.: %s",
			args: ["id"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Username can't be like an address: %s",
			args: ["id"]
		},
		INCORRECT_USERNAME_LENGTH: {
			message: "Incorrect username length: %s",
			args: ["asset.username.alias"]
		},
		EXISTS_USERNAME: {
			message: "The username you entered is already in use. Please try a different name.: %s",
			args: ["id"]
		},
		ALREADY_HAVE_USERNAME: {
			message: "The account already has username",
			args: ["id"]
		}
	},
	ACCOUNTS: {
		ACCOUNT_PUBLIC_KEY_NOT_FOUND: {
			message: "Account public key can't be found: %s",
			args: ["address"]
		},
		ACCOUNT_DOESNT_FOUND: {
			message: "Account doesn't found: %s",
			args: ["address"]
		},
		INVALID_ADDRESS: {
			message: "Invalid address: %s",
			args: ["address"]
		}
	},
	DELEGATES: {
		INVALID_RECIPIENT: {
			message: "Invalid recipientId: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i",
			args: ["amount"]
		},
		EMPTY_TRANSACTION_ASSET: {
			message: "Empty transaction asset for delegate transaction: %s",
			args: ["id"]
		},
		USERNAME_CHARS: {
			message: "Username can only contain alphanumeric characters with the exception of !@$&_.: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Username can't be like an address: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_SHORT: {
			message: "Delegate name is too short: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_LONG: {
			message: "Delegate name is longer then 20 chars: ",
			args: ["asset.delegate.username"]
		},
		EXISTS_USERNAME: {
			message: "The delegate name you entered is already in use. Please try a different name.: %s",
			args: ["asset.delegate.username"]
		},
		EXISTS_DELEGATE: {
			message: "Your account are delegate already",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate not found",
			args: []
		},
		FORGER_PUBLIC_KEY: {
			message: "Provide generatorPublicKey in request",
			args: []
		},
		FORGING_ALREADY_ENABLED: {
			message: "Forging on this account already enabled",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate for this secret not found",
			args: []
		},
		FORGER_NOT_FOUND: {
			message: "Forger with this public key not found",
			args: []
		},
		WRONG_USERNAME: {
			message: "Wrong username",
			args: []
		}
	},
	PEERS: {
		PEER_NOT_FOUND: {
			message: "Peers not found",
			args: []
		},
		LIMIT: {
			message: "Max limit is %i",
			args: ['limit']
		},
		INVALID_PEER: {
			message: "Engine is starting",
			args: []
		}
	},
	COMMON: {
		LOADIND: {
			message: "Engine is starting",
			args: []
		},
		DB_ERR: {
			message: "DB system error",
			args: []
		},
		INVALID_API: {
			message: "Api not found",
			args: []
		},
		INVALID_SECRET_KEY: {
			message: "Please, provide valid secret key of your account",
			args: []
		},
		OPEN_ACCOUNT: {
			message: "Open your account to make transaction",
			args: []
		},
		SECOND_SECRET_KEY: {
			message: "Provide second secret key",
			args: []
		},
		ACCESS_DENIED: {
			message: "Access denied",
			args: []
		}
	},
	BLOCKS: {
		BLOCK_NOT_FOUND: {
			message: "Block not found",
			args: []
		},
		WRONG_ID_SEQUENCE: {
			message: "Invalid ids sequence",
			args: []
		}
	},
	TRANSACTIONS: {
		INVALID_RECIPIENT: {
			message: "Invalid recipientId: %s",
			args: ["recipientId"]
		},
		INVALID_AMOUNT: {
			message: "Invalid transaction amount: %i",
			args: ["amount"]
		},
		TRANSACTION_NOT_FOUND: {
			message: "Transaction not found",
			args: []
		},
		TRANSACTIONS_NOT_FOUND: {
			message: "Transactions not found",
			args: []
		},
		RECIPIENT_NOT_FOUND: {
			message: "Recipient is not found",
			args: []
		}
	},
	SIGNATURES: {
		INVALID_ASSET: {
			message: "Empty transaction asset for signature transaction: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i",
			args: ["amount"]
		},
		INVALID_LENGTH: {
			message: "Invalid length for signature public key: %s",
			args: ["id"]
		},
		INVALID_HEX: {
			message: "Invalid hex in signature public key: %s",
			args: ["id"]
		}
	},
	CONTACTS: {
		USERNAME_DOESNT_FOUND: {
			message: "Account doesn't found: %s",
			args: []
		},
		SELF_FRIENDING: {
			message: "Can´t add yourself in contacts",
			args: []
		},
		ALREADY_ADDED_UNCONFIRMED: {
			message: "Can´t add account in contacts",
			args: []
		},
		ALREADY_ADDED_CONFIRMED: {
			message: "Can´t add account in contacts",
			args: []
		}
	},
	MULTISIGNATURES: {
		SIGN_NOT_ALLOWED: {
			message: "You can't sign this transaction: %s",
			args: ["id"]
		},
		NOT_UNIQUE_SET: {
			message: "publicKeys array is not unique",
			args: []
		},
		SELF_SIGN: {
			message: "Prohibited to use self publicKey to sign",
			args: []
		}
	},
	DAPPS: {
		EXISTS_DAPP: {
			message: "This DApp already exists"
		},
		UNKNOWN_CATEGORY: {
			message: "Unknown category of DApp"
		},
		EMPTY_NICKNAME: {
			message: "Empty sia file nickname of DApp"
		},
		UNKNOWN_TYPE: {
			message: "Unknown type of DApp"
		},
		GIT_AND_SIA: {
			message: "DApp contains link to github and sia storage in same time, it's not possible"
		},
		INVALID_GIT: {
			message: "DApp contains incorrect git link"
		},
		EMPTY_NAME: {
			message: "Incorrect DApp name, it's empty"
		},
		TOO_LONG_NAME: {
			message: "Incorrect DApp name, it's too long"
		},
		TOO_LONG_DESCRIPTION: {
			message: "Too long description of DApp"
		},
		TOO_LONG_TAGS: {
			message: "Too long tags of DApp"
		},
		EXISTS_DAPP_NAME: {
			message: "DApp with this name already exists"
		},
		EXISTS_DAPP_NICKNAME: {
			message: "DApp with this sia file nickname already exists"
		},
		EXISTS_DAPP_GIT: {
			message: "DApp with this git link already exists"
		},
		INCORRECT_LINK: {
			message: "DApp must contain sia file nickname or link"
		},
		DAPPS_NOT_FOUND: {
			message: "DApps not found"
		}
	}
}

function error(code, object) {
	var codes = code.split('.');
	var errorRoot = errorCodes[codes[0]];
	if (!errorRoot) return code;
	var errorObj = errorRoot[codes[1]];
	if (!errorObj) return code;

	var args = [errorObj.message];
	errorObj.args.forEach(function (el) {
		var value = null;

		try {
			if (el.indexOf('.') > 0) {
				var els = el.split('.');
				value = object;

				els.forEach(function (subel) {
					value = value[subel];
				});
			} else {
				value = object[el];
			}
		}catch (e){
			value = 0
		}

		args.push(value);
	});

	var error = util.format.apply(this, args);
	return error;
}

module.exports = {
	errorCodes: errorCodes,
	error: error
};