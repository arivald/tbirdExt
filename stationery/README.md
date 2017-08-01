## Synopsis

The Stationery is a extension that allow to load a HTML template into mails, aka email stationery. It also allow to edit HTML source very easily.

## Motivation

I started work on the Stationery, because I needed this feature in my Thunderbird, and there was no usable extension for this yet. Then I released it to the AMO, so everyone with similar needs could use it.

## Building

To build the Stationery extension You need only the /stationery directory, it uses Gradle as build system, embedded version. Just enter the /stationery directory, then type `gradlew clean build` to build XPI. Build XPI will land in /stationery/build directory. `gradlew cleanDownloads` or `gradlew cleanAll` will remove downloaded files.

## License

Completly public domain, use it in any way You want.