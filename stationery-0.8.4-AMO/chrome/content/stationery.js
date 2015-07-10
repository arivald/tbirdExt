/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: stationery.js
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>

description: Stationery module importer
******************************************************************************/

Components.utils.import('resource://stationery/content/stationery.jsm');
Stationery.initWindow(window);
