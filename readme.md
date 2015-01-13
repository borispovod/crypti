### Crypti coin ###

Version 0.1.9


### Install ###
First run:
```
npm install
```

Dependencies

* sqlite3
* grunt-cli

Install sqlite3 (Ubuntu/Debian)

```
apt-get install sqlite3
```

Install sqltie3 (Fedora/CentOS)

```
yum install sqlite
```

Install grunt-cli with global flag

```
npm install grunt-cli -g
```

### Build ###

Before start application static html interface stored in public folder should be built.
```
cd public
bower install
grunt
```

### Start ###
Run:
```
node app.js
```
