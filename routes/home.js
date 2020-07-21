var express = require('express');
var app = express();
var path = require('path');
var exp_val = require('express-validator');
var session = require("express-session");
const fastcsv = require("fast-csv");
var fs = require('fs');
var nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
//var db = require('../database');
const cors = require('cors');
app.use(cors())

module.exports = app;
app.use(session({
    secret: 'EMA_Planner',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 8 * 60 * 1000}
}));
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
)
app.use(bodyParser.json())
//app.use(exp_val());
app.use(express.static(path.join(__dirname, 'store')));

app.get('/', function(req, res){
    res.render('home/home', {
        classes_today: '',
        classes_weekly: ''
    })
});

app.get('/add_student', function(req, res){
    res.render('home/add_student', {
        barcode: '',
        first_name: '',
        last_name: '',
        addr_1: '',
        city: '',
        zip: '',
        email: '',
        phone: '',
        belt_color: '',
        belt_size: ''
    })
});

app.post('/add_student', function(req, res){
    var item = {
        first_name: req.sanitize('first_name'),
        last_name: req.sanitize('last_name'),
        barcode: req.sanitize('barcode').trim(),
        addr_1: req.sanitize('addr_1'),
        city: req.sanitize('city').trim(),
        zip: req.sanitize('zip').trim(),
        email: req.sanitize('email').trim(),
        phone: req.sanitize('phone').trim(),
        belt_color: req.sanitize('belt_color'),
        belt_size: req.sanitize('belt_size').trim()
    }
    console.log(item);
    res.redirect('home');
});