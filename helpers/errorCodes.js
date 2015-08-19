var util = require('util');

var errorCodes = {
	VOTES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient %s in vote transaction, recipient is the same as sender",
			args: ['recipientId']
		},
		MINIMUM_DELEGATES_VOTE: {
			message: "Not enough spare votes available: %s",
			args: ["id"]
		},
		MAXIMUM_DELEGATES_VOTE: {
			message: "Maximum of 33 delegate votes at any one time: %s",
			args: ["id"]
		},
		ALREADY_VOTED_UNCONFIRMED: {
			message: "Can't verify votes, you have already voted for this delegate: %s",
			args: ["id"]
		},
		ALREADY_VOTED_CONFIRMED: {
			message: "Can't verify votes, you have already voted for this delegate: %s",
			args: ["id"]
		}
	},
	USERNAMES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient",
			args: []
		},
		INVALID_AMOUNT: {
			message: "Invalid transaction amount: %s",
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
			message: "Username already exists. Please try a different name.: %s",
			args: ["id"]
		},
		ALREADY_HAVE_USERNAME: {
			message: "Account already has a username",
			args: ["id"]
		}
	},
	ACCOUNTS: {
		ACCOUNT_PUBLIC_KEY_NOT_FOUND: {
			message: "Account with this public key not found: %s",
			args: ["address"]
		},
		ACCOUNT_DOESNT_FOUND: {
			message: "Account not found: %s",
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
			message: "Delegate name is too long, maximum is 20 chars: ",
			args: ["asset.delegate.username"]
		},
		EXISTS_USERNAME: {
			message: "Delegate name already exists. Please try a different name.: %s",
			args: ["asset.delegate.username"]
		},
		EXISTS_DELEGATE: {
			message: "Account already registered as a delegate",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate not found",
			args: []
		},
		FORGER_PUBLIC_KEY: {
			message: "Missing generatorPublicKey in request",
			args: []
		},
		FORGING_ALREADY_ENABLED: {
			message: "Forging on this account is already enabled",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate with this passphrase not found",
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
			message: "Maximum limit is %i",
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
			message: "Invalid passphrase, please provide a valid passphrase",
			args: []
		},
		OPEN_ACCOUNT: {
			message: "Please open your account to send a transaction",
			args: []
		},
		SECOND_SECRET_KEY: {
			message: "Please provide your second passphrase",
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
			message: "Recipient not found",
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
			message: "Invalid public key signature key length: %s",
			args: ["id"]
		},
		INVALID_HEX: {
			message: "Invalid public key signature hex value: %s",
			args: ["id"]
		}
	},
	CONTACTS: {
		USERNAME_DOESNT_FOUND: {
			message: "Account not found: %s",
			args: []
		},
		SELF_FRIENDING: {
			message: "Can't add own account to contacts",
			args: []
		},
		ALREADY_ADDED_UNCONFIRMED: {
			message: "Can't add account to contacts",
			args: []
		},
		ALREADY_ADDED_CONFIRMED: {
			message: "Can't add account to contacts",
			args: []
		}
	},
	MULTISIGNATURES: {
		SIGN_NOT_ALLOWED: {
			message: "Permission to sign transaction denied: %s",
			args: ["id"]
		},
		NOT_UNIQUE_SET: {
			message: "publicKeys array is not unique",
			args: []
		},
		SELF_SIGN: {
			message: "Permission to sign transaction using own public key denied",
			args: []
		}
	},
	DAPPS: {
		STORAGE_MISSED: {
			message: "Missing DApp sia/git storage option",
			args: []
		},
		EXISTS_DAPP: {
			message: "DApp already exists",
			args: []
		},
		UNKNOWN_CATEGORY: {
			message: "Unknown DApp category",
			args: []
		},
		EMPTY_NICKNAME: {
			message: "Empty DApp sia file nickname",
			args: []
		},
		UNKNOWN_TYPE: {
			message: "Unknown DApp type",
			args: []
		},
		GIT_AND_SIA: {
			message: "DApp must contain either a github or sia storage link, not both",
			args: []
		},
		INVALID_GIT: {
			message: "DApp git link is invalid",
			args: []
		},
		EMPTY_NAME: {
			message: "Empty DApp name",
			args: []
		},
		TOO_LONG_NAME: {
			message: "DApp name is too long",
			args: []
		},
		TOO_LONG_DESCRIPTION: {
			message: "DApp description is too long",
			args: []
		},
		TOO_LONG_TAGS: {
			message: "One or more DApp tags are too long",
			args: []
		},
		EXISTS_DAPP_NAME: {
			message: "DApp with this name already exists",
			args: []
		},
		EXISTS_DAPP_NICKNAME: {
			message: "DApp with this sia file nickname already exists",
			args: []
		},
		EXISTS_DAPP_GIT: {
			message: "DApp with this git link already exists",
			args: []
		},
		INCORRECT_LINK: {
			message: "DApp must contain either a sia file nickname or link",
			args: []
		},
		DAPPS_NOT_FOUND: {
			message: "DApps not found",
			args: []
		},
		MISSED_SIA_ASCII: {
			message: "Missing sia ascii link",
			args: []
		},
		INCORRECT_ASCII_SIA: {
			message: "Incorrect sia ascii code: %s",
			args: ["siaAscii"]
		},
		INCORRECT_SIA_ICON: {
			message: "Incorrect sia ascii icon: %s",
			args: ["siaIcon"]
		},
		ALREADY_SIA_ICON: {
			message: "Dapp already has a sia icon code",
			args: []
		},
		INCORRECT_ICON_LINK: {
			message: "Incorrect icon link: %s",
			args: ['icon']
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