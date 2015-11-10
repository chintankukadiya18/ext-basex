# Introduction #

This page is designed to answer some common questions about how ext-basex works and how to handle simple to complex issues.


# FAQ Topics #

> ## How does one deploy ext-basex within an existing Ext application? ##
> ### Answer: ###
> Proper library placement is key. In order for (the newly extended) Ext.lib.Ajax singleton to get Observable support, ext-basex.js must be placed **after** the ext-base.js adapter and the Ext javascript module that provides Ext.util.Observable support. For most installations, this will be either ext-all[-debug].js or ext-core.js. Including it before these modules (although fully functional in all other respects) will not permit Ext.lib.Ajax to generate the events described [here](basexevents.md).
```
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<title>Your Page for ExtJs 2.0</title>
<link rel="stylesheet" type="text/css" href="../resources/css/ext-all.css" />
     <script type="text/javascript" src="../adapter/ext/ext-base.js"></script>
     <script type="text/javascript" src="../ext-all.js"></script>
     <script type="text/javascript" src="../ext-basex.js"></script>
</head>
```

> ## How do I make a synchronous Ajax request using ext-basex? ##
> ### Answer: ###
> Add the **async:false** config option to any request you would normally make throughout the Ext framework:
```
  Ext.Ajax.request (
  {url: 'someUrl.php',
   async : false,
   ....
  });
```
> or, make all future requests synchronous:
```
 Ext.lib.Ajax.async = false;
```