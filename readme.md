### Crypti coin ###

Version 0.1


### Install ###
First run:
```
npm install
```

Then run:
```
hg clone https://bpovod@bitbucket.org/bpovod/ed25519-node
npm link ./ed25519-node
```

### Start ###
Run:
```
node app.js
```

And open this link:
```
http://localhost:6040
```

### Test ###

Open for unlock account:
```
http://localhost:6040/unlock?username=test&password=test
```

You will see:
```
{
  "publicKey": "e9b52567e9e5ff99270e07b63a2a6f1ff41c4db58da62416f8b0b2c3f6c53b6c",
  "address": "15880686153265399104C"
}
```
