module.exports = {
    "goto" : gotoAccount,
    "goto.fromMenu" : gotoAccountFromMenu,
    "view.check" : checkAccountView
};

function gotoAccount() {
    this
        .goto("/account")
        .wait();
}

function gotoAccountFromMenu(){
    this
        .click('#menu [ui-sref="main.account"]')
        .exec(function(result, done){
            if (! result) return done("Account link was not clicked");

            done();
        })
        .wait();
}

function checkAccountView() {
    this
        .eval(function(){
            return document.querySelector('#account') != null;
        })
        .exec(function(value, done){
            if (! value) return done("#account not found");

            done(null, value);
        })
        .eval(function(){
            return document.querySelector('button[ng-click="sendCrypti()"]') != null;
        })
        .exec(function(value, done){
            if (! value) return done("'Send crypti' button not found");

            done(null, value);
        })
        .eval(function(){
            return document.querySelector('#transactions') != null;
        })
        .exec(function(value, done){
            if (! value) return done("Transactions table not found");

            done(null, value);
        });
}