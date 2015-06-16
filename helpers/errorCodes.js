var util = require('util');

var errorCodes = {
	VOTES: {
		INCORRECT_RECIPIENT: {
			message: "Invalid recipient ID: %s. Recipient ID identical to sender ID",
			args: ['recipientId']
		},
		MINIMUM_DELEGATES_VOTE: {
			message: "To vote, you must select at least one delegate: TX ID: %s",
			args: ["id"]
		},
		MAXIMUM_DELEGATES_VOTE: {
			message: "You can only vote for a maximum of 33 delegates at any one time: TX ID: %s",
			args: ["id"]
		},
		ALREADY_VOTED_UNCONFIRMED: {
			message: "Can't verify votes, you already voted for this delegate: %s",
			args: ["id"]
		},
		ALREADY_VOTED_CONFIRMED: {
			message: "You already voted for this delegate: TX ID: %s",
			args: ["id"]
		}
	},
	USERNAMES: {
		INCORRECT_RECIPIENT: {
			message: "Invalid recipient. Please try again",
			args: []
		},
		INVALID_AMOUNT: {
			message: "Invalid amount. Please try again. TX ID: %s",
			args: ["id"]
		},
		EMPTY_ASSET: {
			message: "Username TX: Empty transaction asset. Please try again. TX ID: %s",
			args: ["id"]
		},
		ALLOW_CHARS: {
			message: "Username can only contain alphanumeric characters with the exception of !@$&_. TX ID: %s",
			args: ["id"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Username cannot be a potential address. TX ID: %s",
			args: ["id"]
		},
		INCORRECT_USERNAME_LENGTH: {
			message: "Invalid username length. Please use 1 to 16 alphanumeric characters. Username: %s",
			args: ["asset.username.alias"]
		},
		EXISTS_USERNAME: {
			message: "The username you entered is already in use. Please try a different name. TX ID: %s",
			args: ["id"]
		},
		ALREADY_HAVE_USERNAME: {
			message: "This account already has a username registered. You can only have 1 username per account.",
			args: ["id"]
		}
	},
	ACCOUNTS: {
		ACCOUNT_PUBLIC_KEY_NOT_FOUND: {
			message: "Unable to find account public key for this address: %s",
			args: ["address"]
		},
		ACCOUNT_DOESNT_FOUND: {
			message: "Account not found. Address: %s",
			args: ["address"]
		},
		INVALID_ADDRESS: {
			message: "%s is an invalid address. Please provide a valid Crypti address",
			args: ["address"]
		}
	},
	DELEGATES: {
		INVALID_RECIPIENT: {
			message: "Invalid recipient ID. Please try again. TX ID: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i. Please try again",
			args: ["amount"]
		},
		EMPTY_TRANSACTION_ASSET: {
			message: "Delegate TX: Empty transaction asset. TX ID: %s",
			args: ["id"]
		},
		USERNAME_CHARS: {
			message: "Delegate names can only contain alphanumeric characters with the exception of !@$&_. Name: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Delegate names cannot be a potential address. Name: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_SHORT: {
			message: "Delegate name is too short. Please use 1 to 20 characters. Name: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_LONG: {
			message: "Delegate name is longer then 20 characters. Please use 1 to 20 characters. Name: %s",
			args: ["asset.delegate.username"]
		},
		EXISTS_USERNAME: {
			message: "The delegate name you entered is already in use. Please try a different name. Name: %s",
			args: ["asset.delegate.username"]
		},
		EXISTS_DELEGATE: {
			message: "This account is already a delegate",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Unable to find delegate",
			args: []
		},
		FORGER_PUBLIC_KEY: {
			message: "Please provide generatorPublicKey in request",
			args: []
		},
		FORGING_ALREADY_ENABLED: {
			message: "Forging is already enabled on this account",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate not found. Please check the password",
			args: []
		},
		FORGER_NOT_FOUND: {
			message: "The public key you provided does not belong to any delegate",
			args: []
		},
		WRONG_USERNAME: {
			message: "Wrong username",
			args: []
		}
	},
	PEERS: {
		PEER_NOT_FOUND: {
			message: "Unable to find peer",
			args: []
		},
		LIMIT: {
			message: "Maximum number of peers is: %i",
			args: ['limit']
		},
		INVALID_PEER: {
			message: "Peers: Engine is starting",
			args: []
		}
	},
	COMMON: {
		LOADIND: {
			message: "Please wait: Engine is starting",
			args: []
		},
		DB_ERR: {
			message: "DB system error",
			args: []
		},
		INVALID_API: {
			message: "API request was not found. Please check your request and try again",
			args: []
		},
		INVALID_SECRET_KEY: {
			message: "Invalid password. Please try again",
			args: []
		},
		OPEN_ACCOUNT: {
			message: "In order to send a transaction, you are need to first open (log in) your account on this node",
			args: []
		},
		SECOND_SECRET_KEY: {
			message: "Please provide secondary account password",
			args: []
		},
		ACCESS_DENIED: {
			message: "Access denied. Please ensure you are allowed access: config.json file, whitelist sections",
			args: []
		}
	},
	BLOCKS: {
		BLOCK_NOT_FOUND: {
			message: "Unable to find block",
			args: []
		},
		WRONG_ID_SEQUENCE: {
			message: "Invalid ID sequence",
			args: []
		}
	},
	TRANSACTIONS: {
		INVALID_RECIPIENT: {
			message: "Invalid recipient ID: %s. Please try again",
			args: ["recipientId"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount. You cannot send %i XCR. Please try again",
			args: ["amount"]
		},
		TRANSACTION_NOT_FOUND: {
			message: "Unable to find transaction",
			args: []
		},
		TRANSACTIONS_NOT_FOUND: {
			message: "Unable to find transactions",
			args: []
		},
		RECIPIENT_NOT_FOUND: {
			message: "Unable to find recipient",
			args: []
		},
		INVALID_ADDRESS: {
			message: "%s is an invalid address. Please provide a valid Crypti address",
			args: ["address"]
		}
	},
	SIGNATURES: {
		INVALID_ASSET: {
			message: "SIGNATURES: Empty transaction asset. TX ID: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i",
			args: ["amount"]
		},
		INVALID_LENGTH: {
			message: "Invalid length for signature public key. TX ID: %s",
			args: ["id"]
		},
		INVALID_HEX: {
			message: "Invalid hex found in signature public key. TX ID: %s",
			args: ["id"]
		}
	},
	CONTACTS: {
		USERNAME_DOESNT_FOUND: {
			message: "Unable to find this account: %s",
			args: []
		},
		SELF_FRIENDING: {
			message: "Error: You cannot add yourself as your own contact",
			args: []
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
		} catch (e) {
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