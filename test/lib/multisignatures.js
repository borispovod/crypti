/**
 * Ask Sebastian if you have any questions. Last Edit: 02/09/2015
 */

// Requires and node configuration
var node = require('./../variables.js');

// Account info for a RANDOM account (which we create later) - 0 XCR amount | Will act as delegate
var Account1 = node.randomTxAccount();
var Account2 = node.randomTxAccount();
var Account3 = node.randomTxAccount();

var transactionCount = 0;
var transactionList = [];
var offsetTimestamp = 0;

// Used for calculating amounts
var expectedFee = 0;
var totalTxFee = 0;

// Used for test labeling
var test = 0;

// Print data to console
console.log("Starting transactions-test suite");
console.log("Password for Account 1 is: " + Account1.password);
console.log("Password for Account 2 is: " + Account2.password);

// Starting tests //

describe('Transactions', function() {


});