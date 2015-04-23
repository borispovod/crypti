Phantom Browser
---

Phantom browser is wrapper over `phantom` package which make phantom usage synchronous, clear and more browser-like. It
allows to pass actions sequences to rule the browser behaviour.

Example. Switch tab page titles

```javascript
var browser = new Browser();

browser
    // Open tab with id A, load url and wait for load finished
    .openTab('A')
    .goto('http://localhost:8080/page-a')
    .wait()
    // Open tab with id B, load url and wait for load finished
    .openTab('B')
    .goto('http://localhost:8080/page-b')
    .wait()
    // Switch to tab A and get its' title
    .switchTab('A')
    .eval(function(){
        return document.title;
    })
    // Switch to tab B and set its' title
    .switchTab('B')
    .actions(function(title, done){
        this.eval(title, function(title){
            this.document.title = title;
        }
    });
    // Run sequence
    .run(function(err){
        if (err) console.error(err);
    });
```

## Browser

Browser inherits nodejs EventEmiiter so it has all methods and properties contained in it. Constructor accept one
argument. It is an Array of plugins (see later).



## Tabs

Phantom browser like other usual browser has tabs. This is useful in situations when you need to check some page data
without leaving current url (and loosing current page state).

Tabs API has three methods: `openTab`, `switchTab` and `closeTab`.

### openTab([id])

This method opens new tab with a given id. If id not passed it will be generated automatically. If tab with such
id already exists then do nothing.

### switchTab(id)

Switch to new specified tab. If tab not found throws an error.

### closeTab([id])

Close tab. If id not specified then close current tab. If tab with such id doesn't found do nothing. If tab is closed
throws an error.

### Tab usage example

```javascript
browser
    .openTab('A')
    .goto('http://site-1.tld/')
    .openTab('B')
    .goto('http://site-2.tld/')
    .switchTab('A')
    // ... do something
    .switchTab('B')
    // ... do something
    .closeTab('B')
    // ... now we at tab 'A'. Do something again
    .run(function(err, result){
        if (err) return console.error(err);
    });
```

## Navigation

### goto(url)

Main navigation method is `goto`. It accept url as a string or an object. Object is converted to string using standard
`url.format` method. If there is no tab it will open new one.

Example.
```javascript
browser
    .goto('http://github.com')
    // it equals to:
    .openTab()
    .goto('http://github.com')
    // and to:
    .openTab()
    .goto({
        hostname: 'github.com'
    })

```

### goBack(n)

Go back. Skip `n` history steps. . Due to phantmjs behaviour call to go back waits for page loading.

_Note_. Need to be tested with History API


### goForward(n)

Go forward. Skip `n` history steps. Due to phantmjs behaviour call to go forward waits for page loading.

_Note_. Need to be tested with History API

### reload()

Reload current page.

## UI

### select(selector)

Set internal cursor to specified element. And focus on it.

```javascript
browser
    .goto('http://site.tld/page.html')
    .select('#logo')
    .click()
    // ...
```

### fill([selector,] value)

Fill input or form with specified value. If selector not specified then fill current selected element.

Example. Fill search input.

```javascript
browser
    .goto('http://search.com')
    .select('#search')
    .fill('something')
    .select('submit')
    .click()
// equals to
browser
    .goto('http://search.com')
    .fill('#search', 'something')
    .select('button')
    .click()
```

Example. Fill form.
```javascript
browser
    .goto('http://search.com')
    .fill('#siginForm', {
        username: 'admin',
        password: '********'
    })
    .select('#siginForm button')
    .click()
```

### submit([selector])

Submit the first form matched by `selector` or current form if selector was not passed.

### click([selector])

Click on element which matches `selector`. If selector not passed use current element.

### text([selector])

Return textContent of element which matches `selector`. If selector not passed use current element.

### html([selector])

Return innerHTML of element which matches `selector`. If selector not passed use current element.



## Interaction

### eval(callback)

Eval method get function which will be converted to string and then evaluated in page environment. It is possible
to pass values from current context but it should be NativeValues (String, Boolean, Number, Object or Array) and
not a Function or a constructor instance. Value returned by evaluated function will be passed into next browser action.

Example. Get page title.

```javascript
browser.goto('http://github.com)
    .eval(function(){
        return document.title
    })
    .run(function(err, title){
        if (err) return console.error(err);

        console.log(title); // Output github main page title
    });
```

Example. Pass values to evaluated function.
```javascript
browser.goto('http://github.com)
    .eval('Title', function(title){
        document.title = title;
    })
    .run(function(err){
        if (err) return console.error(err);

        console.log('DONE'); // Output github main page title
    })
    // ...
```

### evalAsync(callback)

By default evaluation return result immediately. But it is possible to wait some event or do some job asynchronously. To
do asynchronous call use `evalAsync`. Async callback last argument should be a string.

Example. Run async evaluation.

```javascript
browser.goto('http://github.com')
    .evalAsync(function(done){
        $.ajax('/data.json').success(function(data){
            done(null, data);
        }).fail(done);
    })
    // ...
```

## exec(callback)

This method allow to execute some method in current environment and able to make actions within actions queue.

Example. Render page on title mismatch.

```javascript
browser
    .goto('http://localhost/')
    .eval(function(){
        return document.title;
    })
    .exec(function(title){
        if (title === 'Profile') return;

        this.render('./snapshot.png');
    })
    // ...
```

### setGlobal(name, value)

Set value into page environment. It's value will be accessible during all browser lifetime into each page.

Example.
```
browser
    .setGlobal('name', 'admin')
    .goto('http://github.com')
    .eval(function(){
        return nodejs.name;
    })
    .run(function(err, name){
        if (err) return console.error(err);

        console.log(name); // -> 'admin'
    });
```

### getGlobal(name)

Get global variable value.


## Plugins

Plugins are defined on browser start up and look's like usual factories.

Example.

```javascript
var browser = new Browser({
    // Google plugin
    google: function(browser){
        // Download google logo
        browser.addMacros('downloadGoogleLogo', function(saveTo) {
            // ...
        });

        // Inject google's cdn jquery library to each new tab
        browser.on('tabOpened', function(tab){
            tab.page.injectJs('https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js');
        });
    }
})
```

## Macros system

It is possible to add macros for action sequences to repeatedly call it.

### addMacros(name, macros)

To add macros call `addMacros` method and provide macros name and action.

Example.

```javascript
browser.addMacros('pageLogin', function (self, username, password) {
    this
        .click('#showLoginForm')
        .fill('#loginForm', {
            login: username,
            password: password
        })
        .submit('#loginForm');
});
```

### macros(name, params...)

To run `pageLogin` macros described earlier add `macros` call to action sequence.
```javascript
browser
    .goto('http://some-site/login')
    .macros('pageLogin', 'admin', 'qwerty')
    //...
```

## Flow

### wait(event), wait(delay [,period])

Wait for phantom browser event. Event should be a string. If no event passed, onLoadFinished event will be used. Maximum
expectation time is 20 seconds by default. If no event occurs then throw an Timeout error.

Example.

```javascript
browser.openTab()
    .goto('http://www.nasa.gov')
    .click('a.logo')
    // wait for page loading
    .wait()
    .eval(function(){
        return document.title
    })
    //...
```

Wait for delay in milliseconds or in other period passed as the second argument. Period could be: 'second', 'minute', 'hour'.
In plural form 'seconds', 'minutes', 'hours' or in short forms: 'sec', 's', 'min', 'mins', 'm', 'h'.

Example.

```javascript
browser.openTab()
    .goto('http://www.nasa.gov')
    .click('a.logo')
    // wait for 20 seconds
    .wait(20, 'sec')
    .eval(function(){
        return document.title
    })
```

### till([limit, ] exec)

Loop executes `exec` command till it returns true value. `limit` specify maximum command execution times.

Example. Without limit.
```javascript
browser
    .openTab()
    .goto('http://some-site.tld')
    .click('#login')
    .till(function() {
        this
            .wait(1, 's')
            .eval(function(text){
                return document.title !== 'Profile'; // Last action value for till loop check
            });
    })
    // Logged out. Do something
```

Example. With limit.
```javascript
browser
    .openTab()
    .goto('http://some-site.tld')
    .click('#login')
    // Limit execution times count
    .till(10, function() {
        this
            .wait(1, 's')
            .select('#status')
            .text()
            .exec(function(text){
                return text !== 'online'; // Last action value for till loop check
            });
    })
```

### until([limit, ] exec)

Similar to `till` except that command should return `false`.


### exit()

Exit from phantom browser.
