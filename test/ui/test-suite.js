var inspect = require('util').inspect;

// test tools extension
module.exports = function(browser) {
    /**
     * Check if element exists.
     * @param {string} query CSS selector of element.
     * @returns {browser}
     */
    browser.hasElement = function(query){
        this.eval(query, function(query){
            return document.querySelector(query) !== null;
        });
        return this;
    };

    /**
     * Stop the queue if previous action result is equal false. Reject with message.
     * @param {string} message Reject message
     * @returns {browser}
     */
    browser.onFalse = function(message) {
        this.exec(function(value, done){
            if (value === false) return done(message);

            done(null, value);
        });
        return this;
    };

    /**
     * Assert previous action result to match specified value or be equal true.
     * @param {*} match Value to match
     * @param {string} message Assert message
     * @returns {browser}
     */
    browser.assert = function(match, message){
        if (arguments.length === 0) {
            match = true;
        }

        this.addAction(function(self, value){
            if (value != match) {

                message = (message || "{values} expect to be equal {match}")
                    .replace(/\$\{value}/g, inspect(value))
                    .replace(/\$\{match}/g, inspect(match));

                throw new Error(message);
            }

            return value;
        });

        return this;
    };
};
