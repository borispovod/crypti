module.exports = {
    goto : gotoVotes,
    gotoFromMenu : gotoVotesFromMenu,
    viewCheck : viewCheck
};

function gotoVotes() {
    this.goto("/votes")
        .wait();
}

function gotoVotesFromMenu(){
    this
        .click('#menu [ui-sref="main.votes"]')
        .onFalse("Votes link was not clicked")
        .wait();
}

function viewCheck() {
    this
        .hasElement('#account')
        .onFalse('#account not found')
        .hasElement('#account h1')
        .onFalse('#account h1 not found')
        .text('#account h1')
        .assert("Forging > My Votes", "View header ${value} should be equal ${match}")
    ;
}

