module.exports = {
    goto : gotoDelegates,
    gotoFromMenu : gotoDelegatesFromMenu,
    viewCheck : viewCheck
};

function gotoDelegates() {
    this.goto("/delegates")
        .wait();
}

function gotoDelegatesFromMenu(){
    this
        .click('#menu [ui-sref="main.delegates"]')
        .onFalse("Delegates link was not clicked")
        .wait();
}

function viewCheck() {
    this
        .hasElement('#account')
        .onFalse('#account not found')
        .hasElement('#account h1')
        .onFalse('#account h1 not found')
        .text('#account h1')
        .assert("Forging > Delegates", "View header ${value} should be equal ${match}")
        ;
}
