module.exports = {
    login : login
};

// Test login action
function login (browser, password){
    browser
        .hasElement('#enter')
        .onFalse("Enter text field not found")
        .select("#enter")
        .fill(password)
        .select("#login")
        .onFalse("Login button not found")
        .click()
        .wait();
}
