var express = require('express');
var app = express();
var path = require('path');
var session = require("express-session");
var exp_val = require('express-validator');
const fastcsv = require("fast-csv");
var fs = require('fs');
var nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

//var db = require('../database');
const cors = require('cors');
app.use(cors());

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
app.use(exp_val());
app.use(express.static(path.join(__dirname, 'home')));

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
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        barcode: req.body.barcode,
        addr_1: req.body.addr_1,
        city: req.body.city,
        zip: req.body.zip,
        email: req.body.email,
        phone: req.body.phone,
        belt_color: req.body.belt_color,
        belt_size: req.body.belt_size
    }
    console.log(req.body.last_name + ' lastname');
    console.log(item);
    console.log(item.email.sanitize().trim());
    console.log(item.body.zip.trim());
    res.redirect('/');
});