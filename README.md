## Synopsis

This is repository for all files related to my Thubderbird extensions, Stationery (https://addons.mozilla.org/thunderbird/addon/stationery) and Always HTML (https://addons.mozilla.org/thunderbird/addon/always-html/).
The Stationery is and extension that allow to load a HTML template into mails, aka email stationery. It also allow to edit HTML source very easily.
The Always HTML is extracted small part of the Stationery, with sole purpose to fix one annoying mis-feature of the Thunderbird - it disables code that very often degrade HTML mails to just plain-text, without asking user at all.

## Motivation

I started work on the Stationery, because I needed this feature in my Thunderbird, and there was no usable extension for this yet. 
Then I released it to the AMO, so everyone with similar needs could use it.

## Building

To build the Stationery extension You need only the /stationery directory, it uses Gradle as build system. Use `gradle clean build` to build XPI, it will land in /stationery/build directory. `gradle cleanDownloads` or `gradle cleanAll` will remove downloaded files.

## License

Completly public domain, use it in any way You want.