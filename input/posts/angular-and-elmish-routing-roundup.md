Title: Angular and Elmish Routing Roundup
Published: 2021-10-22
Tags:
    - F#
    - Fable
    - Elmish
    - Angular
Xfer: angular-and-elmish-routing-roundup 
---
This post has been a long time coming, and I apologize for the delay. This
is the second post in a series about getting F#, Fable 2, and Elmish running
inside an Angular application. If you haven't read the first post,
[Subverting Angular using F# and Elmish](xref:subverting-angular-using-elmish), head on over and read that first
as it lays the ground work for this post.

A [sample project](https://github.com/BennieCopeland/SubvertingAngular)
is available at GitHub to allow you to follow along and see how the code 
changes between solutions.

After getting Elmish to run inside of Angular, my next step was to figure out how
to host multiple Elmish pages. There are several options and I tried a couple of
different ways before settling on what I felt was the best method for me.

{.section-heading}
## Requesting the desired page

The first solution I went with was passing in a string from Angular through the
`ElmishPageComponent` to request the desired page from the Elmish application.
This required a change to the `App.fs` to add the individual pages and the new
string input for routing.

#### **`src/elmish/App.fs`**
```fsharp
module App

open System
open Elmish
open Elmish.React
open Fable.React
open Feliz

module PageA =
    type Model = unit
    type Msg = | NoOp
    let init () = (), Cmd.none
    let update msg state = state, Cmd.none
    let view state dispatch = Html.h1 "Hello Page A"

module PageB =
    type Model = unit
    type Msg = | NoOp
    let init () = (), Cmd.none
    let update msg state = state, Cmd.none
    let view state dispatch = Html.h1 "Hello Page B"

type Route =
    | Todos
    | PageA
    | PageB
    | Unknown
    with
    static member fromStr str =
      match str with
      | "Todos" -> Todos
      | "PageA" -> PageA
      | "PageB" -> PageB
      | _ -> Unknown

type Page =
    | Todos of Todos.Model
    | PageA of PageA.Model
    | PageB of PageB.Model
    | NotFound

type Msg =
    | TodosMsg of Todos.Msg
    | PageAMsg of PageA.Msg
    | PageBMsg of PageB.Msg

type InitProps =
    {
        AuthToken : string
        Page : string
    }

type State = {
        AuthToken : string
        Page : Page
    }

let init (props: InitProps) =
    let page, cmd =
        match Route.fromStr props.Page with
        | Route.Todos ->
            let page, cmd = Todos.init ()
            Page.Todos page, Cmd.map TodosMsg cmd
        | Route.PageA ->
            let page, cmd = PageA.init ()
            Page.PageA page, Cmd.map PageAMsg cmd
        | Route.PageB ->
            let page, cmd = PageB.init ()
            Page.PageB page, Cmd.map PageBMsg cmd
        | Route.Unknown -> Page.NotFound, Cmd.none

    {
        AuthToken = props.AuthToken
        Page = page
    }, cmd

let update msg state =
    match msg, state.Page with
    | TodosMsg subMsg, Todos subState ->
        let nextState, nextCmd = Todos.update subMsg subState
        { state with Page = Todos nextState }, Cmd.map PageAMsg nextCmd
    | PageAMsg subMsg, PageA subState ->
        let nextState, nextCmd = PageA.update subMsg subState
        { state with Page = PageA nextState }, Cmd.map PageAMsg nextCmd
    | PageBMsg subMsg, PageB subState ->
        let nextState, nextCmd = PageB.update subMsg subState
        { state with Page = PageB nextState }, Cmd.map PageBMsg nextCmd
    | _, _ ->
        // log a likely invalid transition
        state, Cmd.none

let view model dispatch =
    match model.Page with
    | Todos subState -> Todos.view subState (TodosMsg >> dispatch)
    | PageA subState -> PageA.view subState (PageAMsg >> dispatch)
    | PageB subState -> PageB.view subState (PageBMsg >> dispatch)
    | NotFound -> Html.h1 "Page not found"

let appInit htmlId authToken page =
    let props: InitProps = {
        AuthToken = authToken
        Page = page
    }

    Program.mkProgram init update view
    |> Program.withReactSynchronous htmlId
    |> Program.withConsoleTrace
    |> Program.runWith props

let killApp domNode =
    ReactDom.unmountComponentAtNode domNode
```

Since the `appInit` function's signature in the `App.fs` file changed, the
`App.d.ts` file also needed to be updated.

#### **`AngularClient/src/App.d.ts`**
```typescript
declare module "*App.fs" {
    function appInit(
        htmlId: string,
        authToken: string,
        page: string
    ): void;
    
    function killApp (htmlId: string): void;
}
```

Finally, the `ElmishPageComponent` needs to pass in the desired page string. Since
this component sits at the endpoint for an Angular route, I realized
that instead of duplicating the component code and hard coding the string, I
could instead rely on the route to add a little data for the component to read.

#### **`elmish-page.component.ts`**
```typescript
import {
    AfterViewInit,
    Component,
    ElementRef,
    OnDestroy,
    OnInit,
    ViewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuid } from 'uuid';
import { appInit, killApp } from '@elmish/App.fs';
import { first } from 'rxjs/operators'

@Component({
    selector: 'elmish-page',
    template:
        `<div class="page">
            <div #elmishApp></div>
        </div>`
})
export class ElmishPageComponent implements
    OnInit, AfterViewInit, OnDestroy {

    @ViewChild("elmishApp") elmishApp!: ElementRef;
    pageId: string = 'unknown'

    constructor(private route: ActivatedRoute) { }

    ngOnInit() {
        this.route.data
            .pipe(first())
            .subscribe(data => {
                this.pageId = data.page
            })
    }

    ngAfterViewInit() {
        // a production app should grab this from an OIDC client
        const authToken = "FAKE AUTH TOKEN";

        let domNodeId = uuid();

        this.elmishApp.nativeElement.id = domNodeId;
        appInit(domNodeId, authToken, this.pageId);
    }

    ngOnDestroy() {
        // unmounts the react component to prevent leaking memory
        killApp(this.elmishApp.nativeElement);
    }
}
```

Finally, multiple routes are added utilizing the `data` field to pass in the
page id to the `ElmishPageComponent`.

#### **`app-routing.module.ts`**
```typescript
const routes: Routes = [
    {
        path: 'home',
        component: HomeComponent
    },
    {
        path: 'todos',
        component: ElmishPageComponent,
        data: { page: 'Todos'}
    },
    {
        path: 'page-a',
        component: ElmishPageComponent,
        data: { page: 'PageA'}
    },
    {
        path: 'page-b',
        component: ElmishPageComponent,
        data: { page: 'PageB'}
    },
    {
        path: 'bad-page',
        component: ElmishPageComponent,
        data: { page: 'BadPage'}
    },
    {
        path: '',
        redirectTo: '/home',
        pathMatch: 'full'
    }
]
```

This solution worked great and is a fine solution if you have a small number of
independent pages in your Elmish application.

But there are at least a couple of downsides when your Elmish application starts
to get more complex.

The first problem crops up when you want to start having page transitions within
the Elmish application. Say you want a standard CRUD design of having List,
Add, Edit, and View pages. While you can navigate between them just
fine within Elmish, this is never reflected in the browser's URL. A user of the
application will always have to navigate to the initial List page and is unable
to bookmark a the View page for an item in the list. This problem is visible in the
[Todo module](https://github.com/BennieCopeland/SubvertingAngular/blob/RoutingWithRequests/src/elmish/Todos.fs)
code.

The second problem is that this method is unsustainable in the long term. My
plan is to eventually replace Angular with Elmish entirely, and to do so Elmish
**must** be aware of the URL. The longer this method is used the more rework
will be required to change everything to using routes. 

{.section-heading}
## Using Feliz Router, getting better...

As I am using the `Feliz` library from the wonderful
[Zaid Ajaj](https://twitter.com/zaid_ajaj) to write the HTML views,
it was only natural to use his equally excellent `Feliz.Router` to handle the
routing requirement. By making the Elmish application aware of the browser URL,
this pretty much negated most of the changes in the previous section. The
`data` field in the routes, the code to read and store it in the component, and the
signature changes to `appInit` all ended up being rolled back.

I won't go into the details of the `App.fs` code here as it is similar to the
above, but it makes use of the patterns found in the
[Composing Larger Applications](https://zaid-ajaj.github.io/the-elmish-book/#/chapters/scaling/)
chapter of Zaid's free [The Elmish Book](https://zaid-ajaj.github.io/the-elmish-book/#/).
You can view the `App.fs` file in its entirety [here](https://github.com/BennieCopeland/SubvertingAngular/blob/RoutingWithFeliz/src/elmish/App.fs). 
What I will touch on though, is that you need to ensure to configure `Feliz.Router`
to use path based routing instead of it's default hash based routing to match
Angular's default URL location strategy.

#### **`/src/elmish/App.fs`**
```fsharp
let view state dispatch =
    React.router [
        router.pathMode
        router.onUrlChanged (parseUrl >> UrlChanged >> dispatch)
        router.children [
            // your view code
        ]
    ]
```

By introducing the `Feliz.Router` library, it fixes half of the first problem
and all of the second problem of the previous solution.
The library will now update the browser's URL when navigating, but there
is a hidden gotcha if you start defining nested routes. While the user can
see these reflected in the browser's URL, they still can not directly navigate to
them.

The Elmish application is smarter now, and can figure out which page to
display based on the browser's URL, but it still has to be started by calling
the `ElmishPageComponent`. Angular is still the container
application wrapping around Elmish... for now. This means that Angular still
needs to know about the top level routes in it's router file and each time a
new top level page is added to the Elmish application, the Angular router will
need to know about it and call the `ElmishPageComponent`. But what about these
nested routes?

Well, it will need to know about those too, but in a general sense. For example,
if we have some CRUD pages like:
- /todos
- /todos/add
- /todos/edit
- /todos/view/12345

the child routes can use a match all expression to say that anything beneath
`/items` is to be handled by the Elmish application.

#### **`routes.ts`**
```typescript
const routes: Routes = [
    {
        path: '',
        component: AppComponent
    },
    {
        path: 'todos',
        component: ElmishPageComponent,
        children: [
            {
                path: '**',
                component: ElmishPageComponent
            }
        ]
    },
]
```

This nicely solves the remaining issue of the previous solution.

So, I'm done right? Not quite. While I solved the previous issues, I also
introduced another one.

Elmish and the browser are now in agreement about the URL, but poor Angular
is left ignorant of reality. The `Feliz.Router` library changes the browser
URL directly, but that does not trigger Angular's route detection. This can be
seen in the following video. The blue shell is controlled by Angular, while the
white content area is the `ElmishPageComponent`. To get here first required clicking
on the `Todos` menu which triggered the Angular router to navigate to
`/todos`. Within the Elmish application, we further drilled down to the
`/todos/add` which changed the URL, but Angular remains tragically unaware.
Clicking on the `Todos` menu item to return to the list will do nothing as
Angular thinks it is *already* at that route.

![Routing Issue Illustrated](https://youtu.be/kZaHWn4dKNU)

At this point, I've stolen the routing power from Angular, but now I'm going to have
to give it back to fix this new problem.

{.section-heading}
## Integrating a customized Feliz.Router with the Angular Router

This is my current and preferred solution. To understand it, you first have to
understand how `Feliz.Router` works under the hood. There are three main steps to
understand.

### Application initialization
On the start of an Elmish application, there is the `init` function that creates the
initial application state and kicks off any initial asynchronous data calls. It's at this point
that `Router.currentPath()` is called to obtain the URL from the browser and then parsed
into a discriminated union.

#### **`/src/elmish/App.fs`**
```fsharp{data-line="14"}
type Url =
    | Todos of Todos.Url
    | PageA
    | PageB
    | NotFound
    
let parseUrl = function
    | "todos" :: segments -> Url.Todos (Todos.parseUrl segments)
    | [ "page-a" ] -> Url.PageA
    | [ "page-b" ] -> Url.PageB
    | _ -> Url.NotFound

let init props =
    let currentUrl = Router.currentPath() |> parseUrl
    
    let show page =
        {
            AuthToken = props.AuthToken
            CurrentUrl = currentUrl
            CurrentPage = page
        }
    
    match currentUrl with
    | Url.Todos todoUrl ->
        let page, cmd = Todos.init todoUrl
        show (Page.Todos page), Cmd.map TodosMsg cmd

    // rest of init code ommitted
```
 
The `currentUrl` value is then used for pattern matching to determine which page's `init`
function to call to build the page state. 

### Navigating to a new URL
The second step is initiated by `Cmd.navigatePath`, usually in response to a user action
like wanting to edit an item from a list.

#### **`/src/elmish/Todos.fs`**
```fsharp
let update msg state =
    match msg, state.CurrentPage with
    | EditTodoClicked todoId, Page.Todos _ ->
        state, Cmd.navigatePath("todos", "edit", todoId.ToString())
    
    // rest of update code ommitted
```

This command sets the browser's URL and dispatches a custom DOM event, but does not by
itself trigger the view to update. That is the responsibility of the final piece.

### Reacting to that navigation
The final piece to understand is the `React.router` view component. This component doesn't
render anything to the screen, but instead sits
at the top level of the view component hierarchy and creates a listener for the custom DOM event sent by
`Cmd.navigatePath`. This is also where you configure the router with the Elmish message you
want dispatched upon a route change, and whether to use hash or path based routing.

#### **`/src/elmish/App.fs`**
```fsharp
let view state dispatch =
    React.router [
        router.pathMode
        router.onUrlChanged (parseUrl >> UrlChanged >> dispatch)
        router.children [
            // your view code
        ]
    ]
```

When the listener created by `React.router` receives the custom DOM event, it calls the function that was passed
into `router.onUrlChanged` with the new URL. This function dispatchs the
`UrlChanged` message which in turn will trigger the view to update.

### Customizing Feliz

Now that we know how the process works, we somehow have to get Angular plugged in to the
process. That is where a customized `Feliz.Router` comes in.

There are several customizations I introduced along with some refactoring.
- Fixed an issue related to path based routing when using a base HREF other than `/`. This
was important for me as my application doesn't sit at the root web application, but sits
in a subfolder off the root.
- Replaced the code that `Router.navigate` and `Router.navigatePath` relies upon from actually changing the browser URL to firing a
DOM event requesting that the URL be updated.
- Added a second event listener that listens for the "URL update request"
and calls the `navigator` that gets configured in the `React.router` view component.
- As the `Router.navigate` and `Router.navigatePath` code is now identical, I saw no need
to keep the duplicate `navigatePath` versions around and removed them along with the
`Cmd.navigatePath` methods. This allows for easy switching between Hash and Path based
routing as long as you stick with programmatic navigation using `Router.navigate` or
`Cmd.navigate`. If you use HTML anchor tags with HREFs, you will still need to
switch between `Router.format` and `Router.formatPath` depending on your settings.

With this custom router, the `view` function in the `App.fs` file changes to require a
`navigator` function that it passes to the custom router. If the `router.navigator` is
not set, it defaults to the normal `Feliz.Router` behavior of setting the browser URL
itself.

#### **`/src/elmish/App.fs`**
```fsharp{data-line="3"}
let view navigator model dispatch =
    React.router [
        router.navigator navigator
        router.pathMode
        router.onUrlChanged (parseUrl >> UrlChanged >> dispatch)
        router.children [
            match model.CurrentPage with
            | Todos subState -> Todos.view subState (TodosMsg >> dispatch)
            | PageA subState -> PageA.view subState (PageAMsg >> dispatch)
            | PageB subState -> PageB.view subState (PageBMsg >> dispatch)
            | NotFound -> Html.h1 "Page not found"
        ]
    ]
```

The `navigator` function is a wrapper function defined in the `appInit`, and when called,
maps the `HistoryMode` type of `Feliz.Router` to a boolean that will be used for the
`skipLocationChange` parameter of the Angular router. It then calls the `setRoute` function
with the array of path segments and the `skipLocationChange` boolean. The `setRoute` function
is then responsible for triggering the browser URL change.

#### **`/src/elmish/App.fs`**
```fsharp{data-line="6-11"}
let appInit htmlId authToken (setRoute : string array -> bool -> unit) =
    let props: InitProps = {
        AuthToken = authToken
    }

    let navigator (segments, mode) =
        let skipLocationChange =
            match mode with
            | HistoryMode.ReplaceState -> true
            | _ -> false
        setRoute (Array.ofList segments) skipLocationChange

    Program.mkProgram init update (view navigator)
    |> Program.withReactSynchronous htmlId
    |> Program.withConsoleTrace
    |> Program.runWith props
```

Of course the `App.d.ts` file needs to change now to reflect the updated `appInit` and
require that the `setRoute` function be provided.

#### **`/src/elmish/App.d.ts`**
```typescript{data-line="5"}
declare module "*App.fs" {
  function appInit(
      htmlId: string,
      authToken: string,
      router: (commands: string[], skipLocationChange: boolean) => void
  ): void;

  function killApp (domNode: Element): void;
}
```

The `ElmishPageComponent` gets two changes. The first is the code to provide the Angular
router to the Elmish application. The `zone.run` must be used here as this function will
be called from within the Elmish code, and Angular requires that its stuff be ran within
an `ngZone`.

#### **`/src/app/elmish-page.component.ts`**
```typescript{data-line="9-13"}
ngAfterViewInit() {
  // a production app should grab this from an OIDC client
  const authToken = "FAKE AUTH TOKEN";

  let domNodeId = uuid();

  this.elmishApp.nativeElement.id = domNodeId;

  const navigate = (value: string[], skipLocationChange: boolean) => {
    this.zone.run(() =>
      this.router.navigate(
        value
        , {skipLocationChange : skipLocationChange}));
  }

  appInit(domNodeId, authToken, navigate);
}
```

While this updates the brower's URL and makes Angular happy, we now have the opposite problem
from before. The Elmish application is now the one unaware of the new URL change that took
place. That is where the last bit of code comes in. After the Angular router finishes
making its route change, a custom event is fired off by a route subscription. This event
is listened for by the custom `Feliz.Router` which triggers the `route.onUrlChanged` and
completes the circle.

#### **`/src/app/elmish-page.component.ts`**
```typescript
ngOnInit() {
  this.routeSubscription =
    this.router.events.subscribe((event: Event) => {
      // On NavigationEnd, fires a custom event required by
      // Feliz Router to trigger route detection
      if (event instanceof NavigationEnd) {
        let ev = document.createEvent("CustomEvent")

        ev.initEvent ("CUSTOM_NAVIGATION_EVENT_FINISHED", true, true);
        window.dispatchEvent(ev);
      }
    })
}
```

{.section-heading}
## Conclusion
This was a pretty long post, and if you made it this far, congratulations for sticking
it out.
With the custom `Feliz.Router` in place you are now ready to take on Angular and start
seamlessly replacing it from the inside out with no one the wiser.