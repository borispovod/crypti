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

## Tabs

Phantom browser like other usual browser has tabs. This is useful in situations when you need to check some page data
without leaving current url (and loosing current page state).

Tabs API has three methods: `openTab`, `switchTab` and `closeTab`.

### openTab([id])

This method opens new tab with a given id. If id not passed it will be generated automatically. If tab with such
id already exists then do nothing.

### switchTab(id)

Switch to new specified tab. If tab not found emit an error.

### closeTab([id])

Close tab. If id not specified then close current tab. If tab with such id doesn't found do nothing. If tab is closed
throws an error.

## Shared variables

There is an ability to store values into page scope and