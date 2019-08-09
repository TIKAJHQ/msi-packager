var fs = require('fs')
var map = require('async-each')
var join = require('path').join
var el = require('./lib/hyperxml')

module.exports = generateXml

function generateXml(options, cb) {
    getComponents('.', options, function (err, components, ids) {
        if (err) return cb(err)

        var optionsWithIds = Object.create(options)
        optionsWithIds.componentIds = ids

        cb(null, installerFor(components, optionsWithIds).toXml({pretty: true}))
    })
}

function installerFor(components, options) {

    let programFiles = options.arch === "x64" ? "%programfiles%" : "%programfiles(x86)%"
    
    //store install Execute Commands
    let installExecute = [


    ];

    //store prodcut top level information. 
    let productInformation = [
        el('Package', {
            InstallerVersion: "200",
            Compressed: "yes",
            Keywords: options.keywords || "",
            Description: options.description || "",
            Manufacturer: options.manufacturer,
            Comments: options.comment || "",
            InstallScope: options.localInstall ? "perUser" : "perMachine",

        }),
        el('Icon', {
            Id: "icon.ico",
            SourceFile: options.iconPath
        }),

        el('Property', {
            Id: 'ARPPRODUCTICON',
            Value: 'icon.ico'
        }),


        options.urlInfoAbout ? el('Property', {
            Id: 'ARPURLINFOABOUT',
            Value: options.urlInfoAbout
        }) : "",

        options.urlInfoUpdate ? el('Property', {
            Id: 'ARPURLUPDATEINFO',
            Value: options.urlInfoUpdate
        }) : "",


        el('Property', {
            Id: 'PREVIOUSVERSIONSINSTALLED',
            // Secure: 'yes'
        }),

        el('Upgrade', {
            Id: options.upgradeCode
        }, [
            el('UpgradeVersion', {
                Minimum: '0.0.0',
                Property: "PREVIOUSVERSIONSINSTALLED",
                IncludeMinimum: "yes",
                IncludeMaximum: "no"
            })
        ]),

        el('Property', {
            Id: "cmd",
            Value: "cmd.exe"
        }),
        el('Media', {
            Id: '1',
            Cabinet: 'app.cab',
            EmbedCab: 'yes'
        }),
        el('Directory', {
            Id: 'TARGETDIR',
            Name: 'SourceDir'
        }, [
            el('Directory', {
                Id: getProgramsFolder(options),
            }, [
                el('Directory', {
                    Id: 'INSTALLDIR',
                    Name: options.name,
                }, components)
            ])
        ]),

        el('Feature', {
            Id: 'App',
            Level: '1'
        }, options.componentIds.map(function (id) {
            return el('ComponentRef', {Id: id})
        }))
    ];


    Object.keys(options.customAction).forEach(actionID => {
        let action = options.customAction[actionID];
        let attr = {
            Action: actionID,
        }
        attr[action.condition.type] = action.condition.event
        installExecute.push(el('Custom', attr, [action.condition.install]));

        productInformation.push(
            el('CustomAction', {
                Id: actionID,
                ExeCommand: '/c ""' + programFiles + "\\" + options.name + "\\" + (action.executable || options.executable) + '"" ' + (action.executableArgs || ""),
                Execute: "immediate",
                Impersonate: "yes",
                Return: "check",
                Property: "cmd"
            })
        )
    });

    //add installer information.
    productInformation.push(el('InstallExecuteSequence', installExecute));

    return el('Wix', {
        xmlns: 'http://schemas.microsoft.com/wix/2006/wi'
    }, [el('Product', {
        Id: '*',
        Name: options.name,
        UpgradeCode: options.upgradeCode,
        Language: '1033',
        Codepage: '1252',
        Version: options.version,
        Manufacturer: options.manufacturer,
    }, productInformation)]);
}

function getComponents(path, options, cb) {
    var fullPath = join(options.source, path)
    var ids = []

    fs.readdir(fullPath, function (err, entries) {
        if (err) return cb(err)
        entries = entries.filter(function (entry) {
            return entry !== '.DS_Store'
        })
        map(entries, function (entry, next) {
            var subPath = join(path, entry)
            fs.stat(join(fullPath, entry), function (err, stats) {
                if (err) return next(err)
                if (stats.isDirectory()) {
                    getComponents(subPath, options, function (err, components, subIds) {
                        if (err) return next(err)
                        ids.push.apply(ids, subIds)
                        next(null, el('Directory', {
                            Id: escapeId(subPath),
                            Name: entry
                        }, components))
                    })
                } else {
                    var id = escapeId(subPath)
                    ids.push(id)

                    var items = [
                        el('File', {
                            Id: id,
                            Source: join(fullPath, entry),
                            Name: entry
                        })
                    ]

                    if (options.shortcuts && subPath === options.executable) {
                        items.push(el('Shortcut', {
                            Id: 'StartMenuShortcut',
                            Advertise: 'yes',
                            Icon: 'icon.ico',
                            Name: options.name,
                            Directory: 'ProgramMenuFolder',
                            WorkingDirectory: 'INSTALLDIR',
                            Description: options.description || ''
                        }), el('Shortcut', {
                            Id: 'DesktopShortcut',
                            Advertise: 'yes',
                            Icon: 'icon.ico',
                            Name: options.name,
                            Directory: 'DesktopFolder',
                            WorkingDirectory: 'INSTALLDIR',
                            Description: options.description || ''
                        }))
                    }

                    next(null, el('Component', {
                        Id: id,
                        Guid: '*'
                    }, items))
                }
            })
        }, function (err, components) {
            if (err) return cb(err)
            cb(null, components, ids)
        })
    })
}

function getProgramsFolder(options) {
    if (options.localInstall) {
        return 'LocalAppDataFolder'
    } else {
        if (options.arch === 'x64') {
            return 'ProgramFiles64Folder'
        } else {
            return 'ProgramFilesFolder'
        }
    }
}

function escapeId(id) {
    return encodeURIComponent(id)
}
