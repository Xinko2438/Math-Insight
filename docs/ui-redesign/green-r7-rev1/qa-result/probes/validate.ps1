$ErrorActionPreference='Stop'
$q=$PSScriptRoot | Split-Path -Parent
$p=Get-Content -LiteralPath "$q\probes\presentation-initial.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$t=Get-Content -LiteralPath "$q\probes\target.json" -Raw -Encoding UTF8 | ConvertFrom-Json
function Lum($a){$v=0.0; $weights=@(0.2126,0.7152,0.0722);for($j=0;$j -lt 3;$j++){ $c=[double]$a[$j]/255; $linear=if($c -le 0.04045){$c/12.92}else{[Math]::Pow(($c+0.055)/1.055,2.4)}; $v+=$linear*$weights[$j] };return $v}
$groups=@($p.groups)+@($t.closedContrast | ForEach-Object {$_.measurement})
$calc=@($groups | ForEach-Object { $f=Lum $_.effectiveForeground; $b=Lum $_.bg; $ratio=([Math]::Max($f,$b)+0.05)/([Math]::Min($f,$b)+0.05); [pscustomobject]@{ratio=$ratio;reported=$_.ratio;delta=[Math]::Abs($ratio-$_.ratio);exact=$_.exactTextComposition} })
if(@($calc | Where-Object {!$_.exact -or $_.ratio -lt 4.5 -or $_.delta -gt 1e-12}).Count){throw 'Contrast mismatch'}
if(@($p.checks | Where-Object {!$_.ok}).Count){throw 'Presentation failed'}
if(@($t.supplement.frames | Where-Object {!$_.ok}).Count){throw 'Zero supplement failed'}
if(@($t.anchor.contexts | Where-Object {!$_.ok}).Count){throw 'Anchor failed'}
$flows=@()
foreach($width in @('375','390')){
 $a=$t.interactions | Where-Object {$_.label -eq "$width-expanded-after-scroll-native-click" -or $_.label -eq "$width-expanded-native-click"} | Select-Object -Last 1
 $b=$t.interactions | Where-Object {$_.label -eq "$width-collapsed-native-click"} | Select-Object -Last 1
 $c=$t.interactions | Where-Object {$_.label -eq "$width-reopened-native-click"} | Select-Object -Last 1
 $ranks=@($a.rows | ForEach-Object {$_.rank}) -join ','
 $ok=($a.rows.Count -eq 8 -and $ranks -eq '1,2,3,4,5,6,7,8' -and @($a.rows | Where-Object {$_.top}).Count -eq 1 -and $a.rows[0].top -and $a.last.within -and $a.newFirst.within -and $a.button.box.h -ge 44 -and $b.rows.Count -eq 5 -and $b.button.within -and $b.button.expanded -eq 'false' -and $c.rows.Count -eq 8 -and $c.last.within -and $c.newFirst.within -and $c.screen.scrollTop -le $c.screen.maxScroll)
 if(!$ok){throw "Interaction flow failed $width"}
 $flows+=[pscustomobject]@{width=$width;ok=$ok;ranks=$ranks;collapsed=@($b.screen.clientH,$b.screen.scrollH,$b.screen.scrollTop);expanded=@($a.screen.clientH,$a.screen.scrollH,$a.screen.scrollTop);reopened=@($c.screen.clientH,$c.screen.scrollH,$c.screen.scrollTop);last=$c.last.text;nameNotTruncated=($c.last.scrollWidth -le $c.last.clientWidth);buttonH=$c.button.box.h}
}
$png=@(Get-ChildItem -LiteralPath "$q\shots" -File | ForEach-Object { $b=[IO.File]::ReadAllBytes($_.FullName); $pixelW=[uint32]$b[16]*16777216+[uint32]$b[17]*65536+[uint32]$b[18]*256+[uint32]$b[19]; $pixelH=[uint32]$b[20]*16777216+[uint32]$b[21]*65536+[uint32]$b[22]*256+[uint32]$b[23]; [pscustomobject]@{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLower();w=$pixelW;h=$pixelH} })
[ordered]@{at=(Get-Date).ToUniversalTime().ToString('o');presentationChecks=$p.checks.Count;presentationFailures=@($p.checks|Where-Object {!$_.ok}).Count;strictZeroChecks=$t.supplement.frames.Count;sharedAnchorChecks=$t.anchor.contexts.Count;flows=$flows;contrast=[ordered]@{groups=$calc.Count;min=($calc.ratio|Measure-Object -Minimum).Minimum;maxDifference=($calc.delta|Measure-Object -Maximum).Maximum;under45=0;inexact=0;values=$calc};png=$png} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$q\probes\validation.json" -Encoding utf8
[pscustomobject]@{flows=$flows;contrastMin=($calc.ratio|Measure-Object -Minimum).Minimum;contrastDifference=($calc.delta|Measure-Object -Maximum).Maximum;png=$png} | ConvertTo-Json -Depth 6 -Compress

