// test tools extension
module.exports = function(browser) {
    browser.hasElement = function(query){
        this.eval(query, function(query){
            return document.querySelector(query) !== null;
        });
        return this;
    };

    browser.onFalse = function(message) {
        this.exec(function(value, done){
            if (value === false) return done(message);

            done(null, value);
        });
        return this;
    }
};
