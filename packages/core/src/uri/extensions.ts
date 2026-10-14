/**
 * Today's attachment icon table (`src/components/evidenceTimeline.js`, A17), copied from the versions the old app's lockfile
 * resolves: `is-image` 3.1.0, `is-video` 1.0.1 with `video-extensions` 1.2.0, `is-text-path` 2.0.0 with `text-extensions`
 * 2.4.0. Those matchers lowercase the extension before the lookup, so the source entries with capitals (`PI1`, `PI2`,
 * `PI3`, `tmLanguage`, `tmTheme`) never matched and are left out.
 */

function extensionSet(list: string): ReadonlySet<string> {
  return new Set(list.trim().split(/\s+/));
}

export const IMAGE_EXTENSIONS = extensionSet(`
  3dv ai amf art ase awg blp bmp bw cd5 cdr cgm cit cmx cpt cr2 cur cut dds dib djvu dxf e2d ecw egt emf eps exif fs gbr gif gpl grf hdp heic heif icns
  ico iff int inta jfif jng jp2 jpeg jpg jps jxr lbm liff max miff mng msp nef nitf nrrd odg ota pam pbm pc1 pc2 pc3 pcf pct pcx pdd pdn pgf pgm pict
  png pnm pns ppm psb psd psp px pxm pxr qfx ras raw rgb rgba rle sct sgi sid stl sun svg sxd tga tif tiff v2d vnd vrml vtf wdp webp wmf x3d xar xbm xcf
  xpm
`);

export const VIDEO_EXTENSIONS = extensionSet(`
  3g2 3gp aaf asf avchd avi drc flv m2v m3u8 m4p m4v mkv mng mov mp2 mp4 mpe mpeg mpg mpv mxf nsv ogg ogv qt rm rmvb roq svi vob webm wmv yuv
`);

export const TEXT_EXTENSIONS = extensionSet(`
  ada adb ads applescript as asc ascii ascx asm asmx asp aspx atom au3 awk bas bash bashrc bat bbcolors bcp bdsgroup bdsproj bib bowerrc c cbl cc cfc
  cfg cfm cfml cgi cjs clj cljs cls cmake cmd cnf cob code-snippets coffee coffeekup conf cp cpp cpt cpy crt cs csh cson csproj csr css csslintrc csv
  ctl curlrc cxx d dart dfm diff dof dpk dpr dproj dtd eco editorconfig ejs el elm emacs eml ent erb erl eslintignore eslintrc ex exs f f03 f77 f90 f95
  fish for fpp frm fs fsproj fsx ftn gemrc gemspec gitattributes gitconfig gitignore gitkeep gitmodules go gpp gradle graphql groovy groupproj grunit
  gtmpl gvimrc h haml hbs hgignore hh hpp hrl hs hta htaccess htc htm html htpasswd hxx iced iml inc inf info ini ino int irbrc itcl itermcolors itk
  jade java jhtm jhtml js jscsrc jshintignore jshintrc json json5 jsonld jsp jspx jsx ksh less lhs lisp log ls lsp lua m m4 mak map markdown master md
  mdown mdwn mdx metadata mht mhtml mjs mk mkd mkdn mkdown ml mli mm mxml nfm nfo noon npmignore npmrc nuspec nvmrc ops pas pasm patch pbxproj pch pem
  pg php php3 php4 php5 phpt phtml pir pl pm pmc pod pot prettierrc properties props pt pug purs py pyx r rake rb rbw rc rdoc rdoc_options resx rexx
  rhtml rjs rlib ron rs rss rst rtf rvmrc rxml s sass scala scm scss seestyle sh shtml sln sls spec sql sqlite sqlproj srt ss sss st strings sty styl
  stylus sub sublime-build sublime-commands sublime-completions sublime-keymap sublime-macro sublime-menu sublime-project sublime-settings
  sublime-workspace sv svc svg swift t tcl tcsh terminal tex text textile tg tk tmpl tpl ts tsv tsx tt tt2 ttml twig txt v vb vbproj vbs vcproj vcxproj
  vh vhd vhdl vim viminfo vimrc vm vue webapp webmanifest wsc x-php xaml xht xhtml xml xs xsd xsl xslt y yaml yml zsh zshrc
`);
