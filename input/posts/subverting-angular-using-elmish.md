Title: Subverting Angular using F# and Elmish
Published: 2021-03-25
Tags:
    - F#
    - Fable
    - Elmish
    - Angular
---
Over the past year I've been wanting to experiment with F#, Fable 2, and Elmish. Only one thing was standing in my way. The application that I
currently maintain is written in Angular. I needed to figure out how to make Angular play nice with F# and Elmish. This is how I infected an
Angular project with Elmish and began replacing it from the inside.

Luckily for me, someone had already explored how to make Angular play nice with other frameworks before me. I found a handy guide on
using [React Components in Angular 2+](https://sdk.gooddata.com/gooddata-ui/docs/4.1.1/ht_use_react_component_in_angular_2.x.html)
that gave me an idea of where to start. However, there were several things I still needed to work out.
- How do I get Angular to build a Fable project?
- How do I get Angular to render an Elmish application?
- How do I handle routing between Angular and the Elmish runtime?

{.section-heading}
## Getting Angular to build a Fable project

The first thing I needed to decide was where to place my Fable project files. For convenience, I decided to keep it in a subfolder
within the Angular source tree and treat it as a library. This would allow me to utilize the existing webpack infrastructure from 
Angular without having to muck about with a multistage build process.

``` treeview {#subverting-angular-treeview .no-line-numbers}
AngularClient/
|-- dist/
|-- e2e/
|-- node_modules/
|-- projects/
|-- src/
|   |-- app/
|   |-- assets/
|   |-- elmish/
|   |   |-- ElmishClient.fsproj
|   |   `-- App.fs
|   `-- environments/
|-- angular.json
|-- browserslist
|-- build.js
|-- package-lock.json
|-- package.json
|-- README.md
|-- tsconfig.json
`-- tslint.json
```

Several new dependencies were required to allow tapping into the Angular build process and actual transpile the Fable
application to Javascript.

To enable Angular to build the F# project, the `@angular-builders/custom-webpack` package is added as a dev dependency to
`package.json`. This package adds a new [Angular CLI builder](https://angular.io/guide/cli-builder) that allows customizing
the webpack build configuration, which Angular normally keeps internal and inaccessible.

The `fable-loader` package allows webpack to properly handle F# files and projects, while the `fable-compiler` package
does the actual transpiling from F# to JavaScript. (**Note**: This is for Fable2. Fable3 has removed the webpack requirement
and has transitioned to being a dotnet CLI tool.)

The Elmish runtime provides the plumbing for the MVU architecture, but does not itself render the view. In fact, it's not even
limited to building only web applications. The following are just some of the template engines you can use:
- `Elmish.WPF` for WPF
- `Fabulous` for Xamarin forms
- `Elmish.Snabbdom` for Snabbdom
- `Fable.React` for React
- `FuncUI` for Avalonia

I went with React as it is the predominate template engine used for the Elmish runtime on the web. It also allowed me to use the React Material-UI
component libraries to remain visually consistent with the Angular application's usage of `@angular/material`.

#### **`AngularClient/package.json`**
```json
{
  "dependencies": {
    "@material-ui/core": "4.9.2",
    "@material-ui/lab": "4.0.0-alpha.41",
    "@material-ui/pickers": "^3.2.10",
    "prop-types": "15.7.2",
    "react": "^16.12.0",
    "react-dom": "^16.12.0"
  },
  "devDependencies": {
    "@angular-builders/custom-webpack": "^8.4.1",
    "fable-compiler": "^2.4.12",
    "fable-loader": "^2.1.8"
  }
}
```

With the dependencies downloaded, I then needed to plug into Angular's build pipeline. This was done by modifying the `angular.json` file
to replace the builder property on the `build` and `serve` targets to be `@angular-builders/custom-webpack`. The location of the custom webpack config is
passed to the new builder via the `customWebpackConfig` option.

#### **`AngularClient/angular.json`**
```json
{
  "projects": {
    "angular-client": {
      "architect": {
        "build": {
          "builder": "@angular-builders/custom-webpack:browser",
          "options": {
            "customWebpackConfig": { "path": "src/webpack.config.js" }
          }
        },
        "serve": {
          "builder": "@angular-builders/custom-webpack:dev-server",
          "options": {
            "customWebpackConfig": { "path": "src/webpack.config.js" }
          }
        }
      }
    }
  }
}
```

The webpack config to build the Fable project is very minimal. It consists of a rule to match on `.fs`, `.fsx`, and `.fsproj` files and
pass them to the Fable compiler via the `fable-loader`.

#### **`AngularClient/src/webpack.config.js`**
```javascript
module.exports = {
    module: {
        rules: [{
            test: /\.fs(x|proj)?$/,
            use: "fable-loader"
        }]
    }
}
```

{.section-heading}
## Getting Angular to render an Elmish application

I started off with the smallest application possible in order to test that everything would work.
Typically, an Elmish application is started on page load by calling the `Program.run` function. Since
Angular is running the show, I needed a way to:

- Control the lifetime of the application
- Support multiple instances of the application
- Pass data in from Angular

This was accomplished by wrapping the Elmish runtime initialization within a function. I was able to
start the application when I wanted, and pass data into the application using the function parameters.
Combined with `Program.runWith`, I was able to pass that data into the the Elmish `init` function.

To support multiple instances of the application running at the same time, the Angular component that
calls the Elmish application creates a `<div>` with a randomly generated Id. This Id is the first
parameter to the function and is used by React as it's attachment point to the DOM. The second parameter
that is passed in is the user's auth token, allowing the Elmish application to make calls to the
backend REST API.

#### **`AngularClient/src/elmish/App.fs`**
```fsharp
module App

open Browser
open Elmish
open Elmish.React
open Fable.React
open Feliz

type State =
    {
        AuthToken : string
    }

let init props =
    props, Cmd.none

let update msg state =
    state, Cmd.none

let view model dispatch =
    Html.h1 "Hello Elmish"

let appInit htmlId authToken =
    let props = {
        AuthToken = authToken
    }
    
    Program.mkProgram init update view
    |> Program.withReactSynchronous htmlId
    |> Program.withConsoleTrace
    |> Program.runWith props

let killApp htmlId =
    let domNode = document.getElementById htmlId
    ReactDom.unmountComponentAtNode domNode
```

The TypeScript compiler cannot directly import the F# code as it doesn't understand it. To solve this problem
I had to create a [TypeScript Declaration File](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
to provide a mapping to what the shape of the `appInit` F# function would be after it is transpiled to JavaScript. 

#### **`AngularClient/src/App.d.ts`**
```typescript
declare module "*App.fs" {
    function appInit(htmlId: string, authToken: string): void;
    
    function killApp (htmlId: string): void;
}
```

Since I am treating the Fable project as a library adjacent to the Angular application, I needed a way to import the Elmish
application that didn't involve spamming relative import paths everywhere. The `tsconfig.json` for the
TypeScript compiler handled this requirement nicely with its `paths` property. This allows me to use `import {appInit} from '@elmish/App.fs'`
to access functions from the Elmish application.

#### **`AngularClient/tsconfig.json`**
```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@elmish": [
        "src/elmish"
      ],
      "@elmish/*": [
        "src/elmish/*"
      ]
    }
  }
}
```

The final piece of the solution is the Angular component that brings all the parts together.
On initialization, the component generates a unique Id for the `<div>` that React will attach to.
After the view is initialized, the user's access token is retrieved and the Elmish application is
started. When the component is destroyed, the underlying React application in terminated to prevent
leaking memory.

#### **`elmish-page.component.ts`**
```typescript
import {
    AfterViewInit,
    Component,
    OnDestroy,
    OnInit
} from '@angular/core';
import { v4 as uuid } from 'uuid';
import { appInit, killApp } from '@elmish/App.fs';
import { OAuthService } from 'angular-oauth2-oidc';

@Component({
    selector: 'elmish-page',
    template:
        `<div class="page">
            <div [id]="rootDomId"></div>
        </div>`
})
export class ElmishPageComponent implements
    OnInit, AfterViewInit, OnDestroy {

    rootDomId: string;

    constructor(private authService: OAuthService) { }

    private isMounted(): boolean {
        return !!this.rootDomId;
    }

    protected render() {
        if (this.isMounted()) {
            const authToken = this.authService.getAccessToken();
            appInit(this.rootDomId, authToken);
        }
    }

    ngOnInit() {
        this.rootDomId = uuid();
    }

    ngAfterViewInit() {
        this.render();
    }
    
    ngOnDestroy() {
        killApp(this.rootDomId); // unmounts the react component
    }
}
```
{.section-heading}
## Conclusion
The solution above is just the beginning. It can support a small contained widget or be expanded to handle
multiple pages with automatic route detection. In a future post I will expand on how I added multiple sub pages and
implemented routing between Angular and Elmish.