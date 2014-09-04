var ed = require('ed25519'),
    company = require('./company.js'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum'),
    utils = require("../utils.js"),
    Constants = require("../Constants.js"),
    companyconfirmation = require("./companyconfirmation.js");

var companyprocessor = function () {
    this.unconfirmedCompanies = {};
    this.confirmedCompanies = {};
    this.addedCompanies = {};
    this.addedCompaniesIds = {};
    this.confirmations = {};
    this.deletedCompanies = [];
    this.domains = [];
    this.addresses = {};
}

companyprocessor.prototype.setApp = function (app) {
    this.app = app;
}

companyprocessor.prototype.getUnconfrimedCompany = function (companyId) {
    return this.unconfirmedCompanies[companyId];
}

companyprocessor.prototype.getRequest = function (companyId) {
    return this.confirmedCompanies[companyId];
}

companyprocessor.prototype.fromJSON = function (JSON) {
    return new company(JSON.name, JSON.description, JSON.domain, JSON.email, JSON.timestamp, JSON.generatorPublicKey, JSON.signature);
}

companyprocessor.prototype.confirmationFromJSON = function (JSON) {
    return new companyconfirmation(JSON.companyId, JSON.verified, JSON.timestamp, JSON.signature);
}

companyprocessor.prototype.confirmationFromByteBuffer = function (bb) {
    var c = new companyconfirmation();

    var companyIdBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        companyIdBuffer[i] = bb.readByte();
    }

    c.companyId = bignum.fromBuffer(companyIdBuffer, { size : '8' }).toString();
    var verified = bb.readByte();

    if (verified == 1) {
        c.verified = true;
    } else {
        c.verified = false;
    }

    c.timestamp = bb.readInt();
    c.signature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        c.signature[i] = bb.readByte();
    }

    return c;
}

companyprocessor.prototype.companyFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();

    var c = new companyconfirmation();
    var companyIdBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        companyIdBuffer[i] = bb.readByte();
    }

    c.companyId = bignum.fromBuffer(companyIdBuffer, { size : '8' });
    var verified = bb.readByte();

    if (verified == true) {
        c.verfied = true;
    } else {
        c.verfieid = false;
    }

    c.timestamp = bb.readInt();
    c.signature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        c.signature[i] = bb.readByte();
    }

    return c;
}

companyprocessor.prototype.companyFromByteBuffer = function (bb) {
    var c = new company();

    var nameLength = bb.readInt();
    var descriptionLength = bb.readInt();
    var domainLength = bb.readInt();
    var emailLength = bb.readInt();

    var nameBuffer = new Buffer(nameLength);
    var descriptionBuffer = new Buffer(descriptionLength);
    var domainBuffer = new Buffer(domainLength);
    var emailBuffer = new Buffer(emailLength);

    for (var i = 0; i < nameLength; i++) {
        nameBuffer[i] = bb.readByte();
    }

    for (var i = 0; i < descriptionLength; i++) {
        descriptionBuffer[i] = bb.readByte();
    }


    for (var i = 0; i < domainLength; i++) {
        domainBuffer[i] = bb.readByte();
    }

    for (var i = 0; i < emailLength; i++) {
        emailBuffer[i] = bb.readByte();
    }

    c.timestamp = bb.readInt();

    var generatorPublicKeyBuffer = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKeyBuffer[i] = bb.readByte();
    }

    var signatureBuffer = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signatureBuffer[i] = bb.readByte();
    }

    c.name = nameBuffer.toString('utf8');
    c.description = descriptionBuffer.toString('utf8');
    c.domain = domainBuffer.toString('utf8');
    c.email = emailBuffer.toString('utf8');
    c.generatorPublicKey = generatorPublicKeyBuffer;
    c.signature = signatureBuffer;

    return c;
}


companyprocessor.prototype.companyFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();

    var c = new company();

    var nameLength = bb.readInt();
    var descriptionLength = bb.readInt();
    var domainLength = bb.readInt();
    var emailLength = bb.readInt();

    var nameBuffer = new Buffer(nameLength);
    var descriptionBuffer = new Buffer(descriptionLength);
    var domainBuffer = new Buffer(domainLength);
    var emailBuffer = new Buffer(emailLength);

    for (var i = 0; i < nameLength; i++) {
        nameBuffer[i] = bb.readByte();
    }

    for (var i = 0; i < descriptionLength; i++) {
        descriptionBuffer[i] = bb.readByte();
    }


    for (var i = 0; i < domainLength; i++) {
        domainBuffer[i] = bb.readByte();
    }

    for (var i = 0; i < emailLength; i++) {
        emailBuffer[i] = bb.readByte();
    }

    c.timestamp = bb.readInt();

    var generatorPublicKeyBuffer = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKeyBuffer[i] = bb.readByte();
    }

    var signatureBuffer = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signatureBuffer[i] = bb.readByte();
    }

    c.name = nameBuffer.toString('utf8');
    c.description = descriptionBuffer.toString('utf8');
    c.domain = domainBuffer.toString('utf8');
    c.email = emailBuffer.toString('utf8');
    c.generatorPublicKey = generatorPublicKeyBuffer;
    c.signature = signatureBuffer;

    return c;
}

companyprocessor.prototype.domainExists = function (domain) {
    if (this.domains.indexOf(domain) >= 0) {
        return true;
    } else {
        return false;
    }
}


companyprocessor.prototype.checkCompanyData = function (company) {
    if (company.name.length <= 0 || company.name.length > 16) {
        this.app.logger.error("Invalid company name length: " + company.name);
        return false;
    }

    if (company.domain.length <= 0 || company.domain.length > 256) {
        this.app.logger.error("Invalid company domain length: " + company.domain);
        return false;
    }

    var domainRe = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/);
    var emailRe = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    if (!company.domain.match(domainRe)) {
        console.log(company.domain);
        this.app.logger.error("Invalid domain: " + company.domain);
        return false;
    }

    if (!emailRe.test(company.email)) {
        this.app.logger.error("Invalid email: " + company.email);
        return false;
    }

    if (company.email.length > 254) {
        this.app.logger.error("Invalid email length: " + company.email);
        return false;
    }

    var domain = company.domain;
    var domainPart = company.email.split("@")[1];


    var a = domain.split('.').reverse(), b = domainPart.split('.').reverse();
    var founds = 0;

    for (var i = 0; i < a.length; i++) {
        if (!b[i]) {
            break;
        }

        if (b[i] == a[i]) {
            founds++;
        } else {
            break;
        }
    }

    if (founds < 2) {
        this.app.logger.error("Invalid domain of email: " + company.email);
        return false;
    }

    return true;
}

companyprocessor.prototype.processCompany = function (company) {
    if (!company.verify()) {
        this.app.logger.error("Can't verify company signature: " + company.domain);
        return false;
    }

    if (company.timestamp > utils.getEpochTime(new Date().getTime())) {
        this.app.logger.error("Invalid timestamp of company: " + company.domain)
        return false;
    }

    var account = this.app.accountprocessor.getAccountByPublicKey(company.generatorPublicKey);

    if (!account) {
        this.app.logger.error("Can't find account generator of company: " + account.address + " / " + company.domain);
        return false;
    }

    if (this.unconfirmedCompanies[company.domain]) {
        this.app.logger.warn("Company already added to unconfirmed companies: " + company.domain);
        return false;
    }

    if (this.confirmedCompanies[company.domain]) {
        this.app.logger.warn("Company already added: " + company.domain);
        return false;
    }

    if (!this.checkCompanyData(company)) {
        this.app.logger.error("Company data invalid: " + company.domain);
        return false;
    }

    if (this.domains.indexOf(company.domain) >= 0) {
        this.app.logger.error("Company domain already added: " + company.domain);
        return false;
    }

    this.unconfirmedCompanies[company.domain] = company;

    return true;
}


module.exports = companyprocessor;