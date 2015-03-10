module.exports = {
    goto : gotoForging,
    gotoFromMenu : gotoForgingFromMenu,
    viewCheck : viewCheck
};

function gotoForging() {
    this.goto("/forging")
        .wait();
}

function gotoForgingFromMenu(){
    this
        .click('#menu [ui-sref="main.forging"]')
        .onFalse("Forging link was not clicked")
        .wait();
}

function viewCheck() {
    this
        .hasElement('#mining')
        .onFalse('#mining not found')
        .hasElement('#blocks')
        .onFalse('Blocks table not found');
}